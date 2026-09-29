package com.khatiyan.d_modules.food.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileSubscriberSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.FoodPlanResponse;
import com.khatiyan.d_modules.food.api.dto.FoodPlanVersionResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriberResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.TenantFoodAvailabilityResponse;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

@Service
public class FoodSubscriptionService {

    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodAccessPolicy accessPolicy;
    private final FoodProfileRepository profileRepository;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final FoodMenuService menuService;
    private final Clock clock;

    public FoodSubscriptionService(
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            FoodModuleSettingService moduleSettingService,
            FoodAccessPolicy accessPolicy,
            FoodProfileRepository profileRepository,
            FoodSubscriptionRepository subscriptionRepository,
            FoodMenuService menuService,
            Clock clock) {
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.moduleSettingService = moduleSettingService;
        this.accessPolicy = accessPolicy;
        this.profileRepository = profileRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.menuService = menuService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TenantFoodAvailabilityResponse availability(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());
        boolean available = property.foodIncluded();
        return new TenantFoodAvailabilityResponse(
                property.id(),
                available,
                available && moduleSettingService.isEnabled(property.id()),
                available ? property.includedMeals() : java.util.Set.of());
    }

    @Transactional(readOnly = true)
    public List<FoodProfileResponse> listAvailableProfiles(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        return profileRepository
                .findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(tenancy.propertyId())
                .stream()
                .map(FoodProfileResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FoodProfileMenuResponse getAvailableProfileMenu(UUID tenantUserId, UUID profileId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        return menuService.listForTenant(tenancy.propertyId(), profileId);
    }

    /**
     * The tenant's plan: what they eat today, a change that starts tomorrow,
     * and whether today's plan stops tonight (2026-09-29). Empty when there is
     * neither a plan today nor one coming.
     */
    @Transactional(readOnly = true)
    public Optional<FoodPlanResponse> current(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        FoodPlanResponse plan = planFor(tenancy.id());
        return plan.today() == null && plan.fromTomorrow() == null ? Optional.empty() : Optional.of(plan);
    }

    /**
     * Chooses a plan. It always starts tomorrow (user, 2026-09-29): today's
     * cooking was planned without the change, so today never moves.
     *
     * <ul>
     *   <li>Today's own plan again: tomorrow's change is dropped and today's
     *       runs on. This also undoes a stop.</li>
     *   <li>A change already set for tomorrow: replaced by this one.</li>
     *   <li>Otherwise: today's plan ends tonight, and this one starts tomorrow.</li>
     * </ul>
     */
    @Transactional
    public FoodPlanResponse subscribe(UUID tenantUserId, SubscribeFoodProfileRequest request) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        Map<DayOfWeek, UUID> week = weekOf(request);
        week.values().stream().distinct().forEach(profileId -> requireProfileForProperty(profileId, tenancy.propertyId()));

        LocalDate today = today();
        LocalDate tomorrow = today.plusDays(1);
        FoodSubscription current = subscriptionRepository.findCoveringForTenancy(tenancy.id(), today).orElse(null);
        FoodSubscription scheduled = scheduled(tenancy.id(), today);

        if (current != null && current.sameWeek(week)) {
            if (scheduled != null) {
                subscriptionRepository.delete(scheduled);
                // Deletes flush last: out before today's plan is open again.
                subscriptionRepository.flush();
            }
            if (current.getEffectiveUntil() != null) {
                current.reopen();
            }
        } else if (scheduled != null) {
            if (!scheduled.sameWeek(week)) {
                scheduled.replaceWeek(week);
            }
        } else {
            if (current != null && current.getEffectiveUntil() == null) {
                current.endOn(tomorrow, "Changed food plan");
                // Updates flush after inserts: today's plan must be closed
                // before tomorrow's opens, or two plans would be open at once.
                subscriptionRepository.flush();
            }
            subscriptionRepository.save(FoodSubscription.start(
                    tenancy.propertyId(), tenancy.id(), tenantUserId, week, tomorrow));
        }
        return planFor(tenancy.id());
    }

    /**
     * Stops the plan. The tenant sees it at once, but today's meals were
     * cooked for them, so the plan runs to midnight and the owner's counts
     * drop then (user, 2026-09-29). A change set for tomorrow goes with it.
     * Available even when the owner has switched food management off.
     */
    @Transactional
    public FoodPlanResponse unsubscribe(UUID tenantUserId) {
        Optional<TenancyResponse> tenancy = tenancyModule.findActiveByUserId(tenantUserId);
        if (tenancy.isEmpty()) {
            return new FoodPlanResponse(null, null, false);
        }
        LocalDate today = today();
        FoodSubscription scheduled = scheduled(tenancy.get().id(), today);
        if (scheduled != null) {
            subscriptionRepository.delete(scheduled);
            subscriptionRepository.flush();
        }
        subscriptionRepository.findCoveringForTenancy(tenancy.get().id(), today)
                .filter(plan -> plan.getEffectiveUntil() == null)
                .ifPresent(plan -> plan.endOn(today.plusDays(1), "Tenant stopped the plan"));
        return planFor(tenancy.get().id());
    }

    /**
     * Tenants eating each profile today. A hybrid tenant counts once under
     * every profile in their week.
     */
    @Transactional(readOnly = true)
    public List<FoodProfileSubscriberSummaryResponse> subscriberCounts(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        Map<UUID, Long> counts = currentPlans(propertyId).stream()
                .flatMap(plan -> plan.profilesUsed().stream())
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        return profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .map(profile -> new FoodProfileSubscriberSummaryResponse(
                        FoodProfileResponse.from(profile),
                        counts.getOrDefault(profile.getId(), 0L)))
                .toList();
    }

    /**
     * Each tenant under each profile in today's plan. A hybrid tenant appears
     * under every profile in their week, with that profile's days (user,
     * 2026-09-29). No scheduled change is shown.
     */
    @Transactional(readOnly = true)
    public List<FoodSubscriberResponse> subscribers(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        List<FoodSubscription> plans = currentPlans(propertyId);
        if (plans.isEmpty()) {
            return List.of();
        }
        Map<UUID, TenancyResponse> tenancies = tenancyModule.findByIds(
                plans.stream().map(FoodSubscription::getTenancyId).collect(Collectors.toSet()));
        Map<UUID, FoodProfile> profiles = profileRepository
                .findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(FoodProfile::getId, Function.identity()));
        var roomIds = tenancies.values().stream()
                .map(TenancyResponse::roomId)
                .collect(Collectors.toSet());
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(propertyId, roomIds);

        List<FoodSubscriberResponse> rows = new ArrayList<>();
        for (FoodSubscription plan : plans) {
            TenancyResponse tenancy = tenancies.get(plan.getTenancyId());
            if (tenancy == null) {
                continue;
            }
            RoomResponse room = rooms.get(tenancy.roomId());
            boolean hybrid = plan.isHybrid();
            for (UUID profileId : plan.profilesUsed()) {
                FoodProfile profile = profiles.get(profileId);
                if (profile == null) {
                    continue;
                }
                rows.add(new FoodSubscriberResponse(
                        plan.getId(),
                        tenancy.id(),
                        plan.getTenantUserId(),
                        tenancy.tenantName(),
                        tenancy.tenantPhone(),
                        room == null ? null : room.roomNumber(),
                        profile.getId(),
                        profile.getName(),
                        plan.getStartedAt(),
                        hybrid,
                        hybrid ? plan.daysOn(profileId) : List.of()));
            }
        }
        rows.sort(Comparator.comparing(
                FoodSubscriberResponse::tenantName,
                Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));
        return rows;
    }

    /**
     * The person has left: their plan ends today, and anything set for
     * tomorrow goes (2026-09-29). Unlike a tenant's own stop, this does not
     * wait for midnight.
     */
    @Transactional
    public void endForTenancy(UUID tenancyId, String reason) {
        LocalDate today = today();
        List<FoodSubscription> later = subscriptionRepository.findByTenancyIdAndEffectiveFromAfter(tenancyId, today);
        if (!later.isEmpty()) {
            subscriptionRepository.deleteAll(later);
            subscriptionRepository.flush();
        }
        subscriptionRepository.findCoveringForTenancy(tenancyId, today)
                .ifPresent(plan -> plan.endOn(today, reason));
    }

    /** Today's plans on the property's live stays. */
    private List<FoodSubscription> currentPlans(UUID propertyId) {
        Set<UUID> activeTenancyIds = tenancyModule.findActiveByPropertyId(propertyId).stream()
                .map(TenancyResponse::id)
                .collect(Collectors.toSet());
        return subscriptionRepository.findCovering(propertyId, today()).stream()
                .filter(plan -> activeTenancyIds.contains(plan.getTenancyId()))
                .toList();
    }

    private FoodPlanResponse planFor(UUID tenancyId) {
        LocalDate today = today();
        FoodSubscription current = subscriptionRepository.findCoveringForTenancy(tenancyId, today).orElse(null);
        FoodSubscription scheduled = scheduled(tenancyId, today);
        Set<UUID> profileIds = new HashSet<>();
        if (current != null) {
            profileIds.addAll(current.profilesUsed());
        }
        if (scheduled != null) {
            profileIds.addAll(scheduled.profilesUsed());
        }
        Map<UUID, FoodProfile> profiles = profileRepository.findAllById(profileIds).stream()
                .collect(Collectors.toMap(FoodProfile::getId, Function.identity()));
        boolean endsTonight = current != null && scheduled == null
                && today.plusDays(1).equals(current.getEffectiveUntil());
        return new FoodPlanResponse(
                current == null ? null : FoodPlanVersionResponse.from(current, profiles),
                scheduled == null ? null : FoodPlanVersionResponse.from(scheduled, profiles),
                endsTonight);
    }

    /** The change set to start after today, if any. There is at most one. */
    private FoodSubscription scheduled(UUID tenancyId, LocalDate today) {
        return subscriptionRepository.findByTenancyIdAndEffectiveFromAfter(tenancyId, today).stream()
                .min(Comparator.comparing(FoodSubscription::getEffectiveFrom))
                .orElse(null);
    }

    /** One profile for every day, or a week with all seven days. Exactly one of the two. */
    private static Map<DayOfWeek, UUID> weekOf(SubscribeFoodProfileRequest request) {
        boolean one = request.profileId() != null;
        boolean week = request.days() != null && !request.days().isEmpty();
        if (one == week) {
            throw new ValidationException("Choose one plan, or a plan for each day of the week");
        }
        return one ? FoodSubscription.everyDay(request.profileId()) : FoodSubscription.requireWeek(request.days());
    }

    private LocalDate today() {
        return ZonedDateTime.now(clock).withZoneSameInstant(MealScheduleRules.ZONE).toLocalDate();
    }

    private TenancyResponse requireActiveAccountTenancy(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));
        if (tenancy.guestStay() || tenancy.userId() == null) {
            throw new ValidationException("Guest stays cannot subscribe to food profiles");
        }
        // Still an active stay (the bed is held), but past its checkout date: nothing starts on it.
        if (tenancy.status() == TenancyStatus.PENDING_EXIT) {
            throw new ValidationException("Your stay is past its checkout date. Speak to your owner about moving out.");
        }
        return tenancy;
    }

    private void ensureFoodEnabled(UUID propertyId) {
        moduleSettingService.requireUsable(propertyId);
    }

    private FoodProfile requireProfileForProperty(UUID profileId, UUID propertyId) {
        FoodProfile profile = profileRepository.findByIdAndActiveTrue(profileId)
                .orElseThrow(() -> new NotFoundException("FoodProfile", profileId));
        if (!profile.getPropertyId().equals(propertyId)) {
            throw new ValidationException("Food profile is not available for this tenancy");
        }
        return profile;
    }
}
