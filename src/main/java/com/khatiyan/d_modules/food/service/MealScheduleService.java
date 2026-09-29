package com.khatiyan.d_modules.food.service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.DelayMealRequest;
import com.khatiyan.d_modules.food.api.dto.MealScheduleResponse;
import com.khatiyan.d_modules.food.api.dto.SaveMealTimingsRequest;
import com.khatiyan.d_modules.food.event.MealDelayedEvent;
import com.khatiyan.d_modules.food.model.FoodMealDelay;
import com.khatiyan.d_modules.food.model.FoodMealTiming;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodMealDelayRepository;
import com.khatiyan.d_modules.food.repository.FoodMealTimingRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealWindow;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * A property's meal timetable, today's meals, and one-day delays (2026-09-28).
 *
 * <p>The one place "which meal is next" is decided. The owner's forecast card,
 * the tenant's Up next and Home card, and the delay notification all read it,
 * where the app used to carry its own hard-coded hours.
 */
@Service
public class MealScheduleService {

    private final PropertyModule propertyModule;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodAccessPolicy accessPolicy;
    private final FoodMealTimingRepository timingRepository;
    private final FoodMealDelayRepository delayRepository;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public MealScheduleService(
            PropertyModule propertyModule,
            FoodModuleSettingService moduleSettingService,
            FoodAccessPolicy accessPolicy,
            FoodMealTimingRepository timingRepository,
            FoodMealDelayRepository delayRepository,
            FoodSubscriptionRepository subscriptionRepository,
            ApplicationEventPublisher eventPublisher,
            Clock clock) {
        this.propertyModule = propertyModule;
        this.moduleSettingService = moduleSettingService;
        this.accessPolicy = accessPolicy;
        this.timingRepository = timingRepository;
        this.delayRepository = delayRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** The owner's view of the meal day. */
    @Transactional(readOnly = true)
    public MealScheduleResponse schedule(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        return build(propertyId);
    }

    /**
     * The same day for a tenant's own property. No access check here: the
     * caller resolves the property from the tenant's active stay, never from
     * the request.
     */
    @Transactional(readOnly = true)
    public MealScheduleResponse scheduleForTenantProperty(UUID propertyId) {
        return build(propertyId);
    }

    /**
     * Saves the timetable. Meals left out of the request keep their current
     * time, and the result is validated whole: moving breakfast later can make
     * it collide with a lunch that was not in the request.
     */
    @Transactional
    public MealScheduleResponse saveTimings(UUID actorUserId, UUID propertyId, SaveMealTimingsRequest request) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        Set<MealType> served = moduleSettingService.requireUsable(propertyId).includedMeals();

        Map<MealType, FoodMealTiming> existing = timingRepository.findByPropertyId(propertyId).stream()
                .collect(Collectors.toMap(FoodMealTiming::getMealType, Function.identity()));
        Map<MealType, MealWindow> timetable = new EnumMap<>(MealType.class);
        for (MealType meal : served) {
            FoodMealTiming saved = existing.get(meal);
            timetable.put(meal, saved != null
                    ? new MealWindow(saved.getStartTime(), saved.getEndTime())
                    : MealScheduleRules.DEFAULTS.get(meal));
        }

        Set<MealType> seen = new HashSet<>();
        for (SaveMealTimingsRequest.Timing timing : request.timings()) {
            if (!served.contains(timing.mealType())) {
                throw new ValidationException(
                        MealScheduleRules.label(timing.mealType()) + " is not served at this property.");
            }
            if (!seen.add(timing.mealType())) {
                throw new ValidationException(
                        MealScheduleRules.label(timing.mealType()) + " appears twice.");
            }
            timetable.put(timing.mealType(), new MealWindow(timing.startTime(), timing.endTime()));
        }
        MealScheduleRules.validateTimetable(timetable);

        for (SaveMealTimingsRequest.Timing timing : request.timings()) {
            FoodMealTiming row = existing.get(timing.mealType());
            if (row == null) {
                timingRepository.save(FoodMealTiming.create(
                        propertyId, timing.mealType(), timing.startTime(), timing.endTime(), actorUserId));
            } else {
                row.update(timing.startTime(), timing.endTime(), actorUserId);
            }
        }
        return build(propertyId);
    }

    /**
     * Pushes one of today's meals later and tells every tenant on a meal plan.
     * The rules decide whether it is allowed. The stored figure is the total
     * from the planned start, so a second delay replaces the first.
     */
    @Transactional
    public MealScheduleResponse delay(UUID actorUserId, UUID propertyId, DelayMealRequest request) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        PropertyResponse property = moduleSettingService.requireUsable(propertyId);
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();

        List<FoodMealDelay> delays = delayRepository.findByPropertyIdAndMealDate(propertyId, today);
        List<MealSlot> day = day(propertyId, property.includedMeals(), delays, now.toLocalTime());
        int total = MealScheduleRules.delayMinutesFor(day, request.mealType(), request.newStartTime(), now.toLocalTime());

        FoodMealDelay row = delays.stream()
                .filter(delay -> delay.getMealType() == request.mealType())
                .findFirst()
                .orElse(null);
        if (row == null) {
            delayRepository.save(FoodMealDelay.create(propertyId, today, request.mealType(), total, actorUserId));
        } else {
            row.setTotal(total, actorUserId);
        }

        MealSlot slot = day.stream().filter(meal -> meal.mealType() == request.mealType()).findFirst().orElseThrow();
        LocalTime newEnd = request.newStartTime().plusMinutes(
                Duration.between(slot.start(), slot.end()).toMinutes());
        // Everyone whose plan applies today (2026-09-29).
        List<UUID> tenants = subscriptionRepository.findCovering(propertyId, today).stream()
                .map(FoodSubscription::getTenantUserId)
                .distinct()
                .toList();
        eventPublisher.publishEvent(new MealDelayedEvent(
                propertyId, property.name(), today, request.mealType(), request.newStartTime(), newEnd, total, tenants));

        return build(propertyId);
    }

    /**
     * Refuses taking a dish off any day but today (user, 2026-09-29). The
     * kitchen knows on the day what it is short of. Putting one back is not
     * held to this, so a dish taken off a later day earlier can still return.
     */
    public void requireToday(LocalDate date) {
        if (date.isAfter(now().toLocalDate())) {
            throw new ValidationException("A dish can be marked unavailable only on the day itself.");
        }
    }

    /**
     * Refuses a change to a meal's dishes once it has started (2026-09-29).
     * While it is being served the kitchen has cooked it, and once it is over
     * there is nothing left to change. A later day has not started, and a past
     * day is over. A meal the property does not serve is left to the caller.
     */
    @Transactional(readOnly = true)
    public void requireNotStarted(UUID propertyId, LocalDate date, MealType mealType) {
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        if (date.isBefore(today)) {
            throw new ValidationException("That day is over, so its dishes can no longer change.");
        }
        if (date.isAfter(today)) {
            return;
        }
        todaySlot(propertyId, mealType, now).ifPresent(slot -> {
                    String meal = MealScheduleRules.label(mealType);
                    switch (slot.status()) {
                        case SERVING -> throw new ValidationException(
                                meal + " is being served, so its dishes can no longer change.");
                        case DONE -> throw new ValidationException(
                                meal + " is over, so its dishes can no longer change.");
                        case UPCOMING -> {
                        }
                    }
                });
    }

    /**
     * Refuses taking a dish off today's meal from 10 minutes before it starts
     * (user, 2026-09-29), the same cutoff as a delay. The start carries the
     * day's delay, so a delayed meal stays open longer. Other days are
     * {@link #requireToday} and {@link #requireNotStarted}'s to answer.
     */
    @Transactional(readOnly = true)
    public void requireDishWindowOpen(UUID propertyId, LocalDate date, MealType mealType) {
        ZonedDateTime now = now();
        if (!date.equals(now.toLocalDate())) {
            return;
        }
        todaySlot(propertyId, mealType, now)
                .filter(slot -> !MealScheduleRules.beforeCutoff(slot, now.toLocalTime()))
                .ifPresent(slot -> {
                    throw new ValidationException("The mark unavailable window has passed for "
                            + MealScheduleRules.label(mealType).toLowerCase(Locale.ENGLISH) + ".");
                });
    }

    /** One of today's meals as it stands now, delay included. Empty for a meal not served here. */
    private Optional<MealSlot> todaySlot(UUID propertyId, MealType mealType, ZonedDateTime now) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        Set<MealType> served = property.foodIncluded() && property.includedMeals() != null
                ? property.includedMeals()
                : Set.of();
        return day(propertyId, served, delayRepository.findByPropertyIdAndMealDate(propertyId, now.toLocalDate()),
                now.toLocalTime())
                .stream()
                .filter(slot -> slot.mealType() == mealType)
                .findFirst();
    }

    private MealScheduleResponse build(UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        Set<MealType> served = property.foodIncluded() && property.includedMeals() != null
                ? property.includedMeals()
                : Set.of();
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();

        Map<MealType, FoodMealTiming> saved = timingRepository.findByPropertyId(propertyId).stream()
                .collect(Collectors.toMap(FoodMealTiming::getMealType, Function.identity()));
        List<MealScheduleResponse.MealTiming> timings = MealScheduleRules.CHRONOLOGICAL.stream()
                .filter(served::contains)
                .map(meal -> {
                    FoodMealTiming row = saved.get(meal);
                    MealWindow window = row != null
                            ? new MealWindow(row.getStartTime(), row.getEndTime())
                            : MealScheduleRules.DEFAULTS.get(meal);
                    return new MealScheduleResponse.MealTiming(meal, window.start(), window.end(), row != null);
                })
                .toList();

        List<MealSlot> day = day(
                propertyId, served, delayRepository.findByPropertyIdAndMealDate(propertyId, today), now.toLocalTime());
        return new MealScheduleResponse(
                today,
                timings,
                day.stream().map(MealScheduleService::toResponse).toList(),
                MealScheduleRules.next(day).map(MealScheduleService::toResponse).orElse(null),
                (int) MealScheduleRules.DELAY_CUTOFF.toMinutes());
    }

    private List<MealSlot> day(UUID propertyId, Set<MealType> served, List<FoodMealDelay> delays, LocalTime now) {
        Map<MealType, MealWindow> timings = timingRepository.findByPropertyId(propertyId).stream()
                .collect(Collectors.toMap(
                        FoodMealTiming::getMealType,
                        row -> new MealWindow(row.getStartTime(), row.getEndTime())));
        Map<MealType, Integer> delayMinutes = delays.stream()
                .collect(Collectors.toMap(FoodMealDelay::getMealType, FoodMealDelay::getDelayMinutes));
        return MealScheduleRules.day(served, timings, delayMinutes, now);
    }

    private ZonedDateTime now() {
        return ZonedDateTime.now(clock).withZoneSameInstant(MealScheduleRules.ZONE);
    }

    private static MealScheduleResponse.MealSlot toResponse(MealSlot slot) {
        return new MealScheduleResponse.MealSlot(
                slot.mealType(), slot.start(), slot.end(), slot.delayMinutes(), slot.status());
    }
}
