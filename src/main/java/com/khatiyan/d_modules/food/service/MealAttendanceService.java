package com.khatiyan.d_modules.food.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceAnalyticsResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceDayResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceHistoryResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceLiveResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceMealResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceState;
import com.khatiyan.d_modules.food.api.dto.MealPassResponse;
import com.khatiyan.d_modules.food.api.dto.MealPassState;
import com.khatiyan.d_modules.food.api.dto.MealScanRequest;
import com.khatiyan.d_modules.food.api.dto.MealScanResponse;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodModuleSetting;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodModuleSettingRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore.Grain;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore.PlanMealCount;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore.MealCount;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore.NewRow;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore.Row;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealStatus;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Meal attendance (user, 2026-11-01). With the switch on, a tenant on a plan for
 * a meal gets a pass when it starts, and any owner or manager scans it to record
 * that they ate. There is no handler: whoever is at the counter scans.
 *
 * <p>The roster is written the first time a meal is asked about after it starts,
 * one row per tenant whose plan has dishes at that meal that day, the same rule
 * the forecast counts by. Writing it holds on to who was expected: plans and
 * menus move later, and the history must not move with them.
 *
 * <p>Scanning is open to every manager, whatever they were granted, like the
 * visitor pass. The switch and the reports are the Meals module's and need its
 * permission.
 */
@Service
public class MealAttendanceService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    /** How far back the analytics' middle duration looks. */
    private static final int MONTH_DAYS = 30;
    /** Two people writing a roster at once can draw the same code. It is rare, and the next try fills the gap. */
    private static final int ROSTER_TRIES = 3;

    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodAccessPolicy accessPolicy;
    private final FoodModuleSettingRepository settingRepository;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final FoodMenuEntryRepository menuEntryRepository;
    private final FoodProfileRepository profileRepository;
    private final MealScheduleService scheduleService;
    private final MealAttendanceStore store;
    private final Clock clock;

    public MealAttendanceService(
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            FoodModuleSettingService moduleSettingService,
            FoodAccessPolicy accessPolicy,
            FoodModuleSettingRepository settingRepository,
            FoodSubscriptionRepository subscriptionRepository,
            FoodMenuEntryRepository menuEntryRepository,
            FoodProfileRepository profileRepository,
            MealScheduleService scheduleService,
            MealAttendanceStore store,
            Clock clock) {
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.moduleSettingService = moduleSettingService;
        this.accessPolicy = accessPolicy;
        this.settingRepository = settingRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.menuEntryRepository = menuEntryRepository;
        this.profileRepository = profileRepository;
        this.scheduleService = scheduleService;
        this.store = store;
        this.clock = clock;
    }

    // ---- The switch --------------------------------------------------------

    /** Turning it on stamps the moment, so a meal already under way is left alone. */
    @Transactional
    public void setEnabled(UUID actorUserId, UUID propertyId, boolean enabled) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        moduleSettingService.requireUsable(propertyId);
        FoodModuleSetting setting = settingRepository.findById(propertyId)
                .orElseThrow(() -> new ValidationException("Food management is turned off for this property"));
        setting.setAttendanceEnabled(enabled, clock.instant());
    }

    // ---- The tenant's pass -------------------------------------------------

    /**
     * The tenant's pass for the meal open now, or else for their next meal
     * today. Null when they have no plan, nothing left today, or the switch is off.
     */
    @Transactional
    public MealPassResponse myPass(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId).orElse(null);
        if (tenancy == null) {
            return null;
        }
        UUID propertyId = tenancy.propertyId();
        FoodModuleSetting setting = setting(propertyId);
        if (setting == null) {
            return null;
        }
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        FoodSubscription plan = subscriptionRepository.findCoveringForTenancy(tenancy.id(), today).orElse(null);
        if (plan == null) {
            return null;
        }
        UUID profileId = plan.profileOn(today);
        for (MealSlot slot : openFirst(scheduleService.todaySlots(propertyId))) {
            boolean open = MealScheduleRules.attendanceOpen(slot, now.toLocalTime());
            if ((!open && slot.status() == MealStatus.DONE) || !hasDishes(propertyId, today, slot.mealType(), profileId)) {
                continue;
            }
            if (!open) {
                return pass(propertyId, today, slot, profileId, MealPassState.UPCOMING, null, null, null);
            }
            if (!counts(setting, propertyId, today, slot)) {
                continue;
            }
            Row row = rowFor(propertyId, today, slot.mealType(), tenancy.id());
            if (row == null) {
                continue;
            }
            return row.attendedAt() != null
                    ? pass(propertyId, today, slot, row.profileId(), MealPassState.RECORDED, null, null, row.attendedAt())
                    : pass(propertyId, today, slot, row.profileId(), MealPassState.OPEN, row.passToken(), row.passCode(), null);
        }
        return null;
    }

    // ---- At the counter ----------------------------------------------------

    /** Whether attendance is on, and the meal open for scanning. Open to every manager. */
    @Transactional
    public MealAttendanceLiveResponse live(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        FoodModuleSetting setting = setting(propertyId);
        if (setting == null) {
            return new MealAttendanceLiveResponse(false, null);
        }
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        for (MealSlot slot : openFirst(scheduleService.todaySlots(propertyId))) {
            if (MealScheduleRules.attendanceOpen(slot, now.toLocalTime()) && counts(setting, propertyId, today, slot)) {
                ensureRoster(propertyId, today, slot.mealType());
                MealCount count = countOf(propertyId, today, slot.mealType());
                return new MealAttendanceLiveResponse(true, new MealAttendanceLiveResponse.OpenMeal(
                        slot.mealType(), slot.start(), slot.end(), count.attended(), count.expected()));
            }
        }
        return new MealAttendanceLiveResponse(true, null);
    }

    /**
     * Records one pass. A pass scanned before is not an error: the person
     * serving needs to see who it was and when, so it comes back marked as
     * already recorded. Nothing asks for a version: two people can scan at once,
     * and the update only lands on a row not yet scanned.
     */
    @Transactional
    public MealScanResponse scan(UUID actorUserId, UUID propertyId, MealScanRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        boolean byToken = request.token() != null && !request.token().isBlank();
        boolean byCode = request.code() != null && !request.code().isBlank();
        if (!byToken && !byCode) {
            throw new ValidationException("Scan their meal pass or enter the code on it.");
        }
        if (setting(propertyId) == null) {
            throw new ValidationException("Meal attendance is turned off for this property.");
        }
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        List<MealSlot> slots = scheduleService.todaySlots(propertyId);
        Row row = byToken
                ? passFromToken(propertyId, request.token().trim(), today, slots, now.toLocalTime())
                : passFromCode(propertyId, request.code().trim(), today, slots, now.toLocalTime());

        boolean recorded = store.markAttended(row.id(), clock.instant(), actorUserId, byToken ? "QR" : "CODE");
        Row saved = store.findById(row.id()).orElseThrow();

        TenancyResponse tenancy = tenancyModule.findByIds(Set.of(saved.tenancyId())).get(saved.tenancyId());
        RoomResponse room = tenancy == null ? null
                : propertyModule.findRoomsForDisplay(propertyId, Set.of(tenancy.roomId())).get(tenancy.roomId());
        FoodProfile profile = profileRepository.findById(saved.profileId()).orElse(null);
        MealCount count = countOf(propertyId, today, saved.mealType());
        return new MealScanResponse(
                tenancy == null ? null : tenancy.tenantName(),
                room == null ? null : room.roomNumber(),
                profile == null ? null : profile.getName(),
                profile == null ? null : profile.getCategory().name(),
                saved.mealType(),
                saved.attendedAt(),
                !recorded,
                count.attended(),
                count.expected());
    }

    private Row passFromToken(UUID propertyId, String token, LocalDate today, List<MealSlot> slots, LocalTime now) {
        Row row = store.findByToken(token)
                .filter(found -> found.propertyId().equals(propertyId))
                .orElseThrow(() -> new ValidationException("That is not a meal pass for this property."));
        String meal = MealScheduleRules.label(row.mealType());
        if (!row.mealDate().equals(today)) {
            throw new ValidationException("This pass was for " + meal.toLowerCase(Locale.ENGLISH)
                    + " on " + SHORT_DAY.format(row.mealDate()) + ".");
        }
        boolean open = slots.stream().anyMatch(
                slot -> slot.mealType() == row.mealType() && MealScheduleRules.attendanceOpen(slot, now));
        if (!open) {
            throw new ValidationException(meal + " is not being served now, so this pass cannot be scanned.");
        }
        return row;
    }

    private Row passFromCode(UUID propertyId, String code, LocalDate today, List<MealSlot> slots, LocalTime now) {
        List<MealSlot> open = openFirst(slots).stream()
                .filter(slot -> MealScheduleRules.attendanceOpen(slot, now))
                .toList();
        if (open.isEmpty()) {
            throw new ValidationException("No meal is being served right now.");
        }
        for (MealSlot slot : open) {
            Optional<Row> row = store.findByCode(propertyId, today, slot.mealType(), code);
            if (row.isPresent()) {
                return row.get();
            }
        }
        throw new ValidationException("That code does not match a pass for "
                + MealScheduleRules.label(open.get(0).mealType()).toLowerCase(Locale.ENGLISH) + ".");
    }

    // ---- The reports -------------------------------------------------------

    /** One day, meal by meal. */
    @Transactional(readOnly = true)
    public MealAttendanceDayResponse day(UUID actorUserId, UUID propertyId, LocalDate date) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        ZonedDateTime now = now();
        if (date.isAfter(now.toLocalDate())) {
            throw new ValidationException("That day has not happened yet.");
        }
        Map<LocalDate, Map<MealType, MealCount>> counts = byDay(store.counts(propertyId, date, date));
        return new MealAttendanceDayResponse(
                date,
                moduleSettingService.isUsable(propertyId) && moduleSettingService.isAttendanceEnabled(propertyId),
                mealsOf(date, counts.getOrDefault(date, Map.of()), propertyId, now));
    }

    /** Who ate at one meal, and who did not. */
    @Transactional(readOnly = true)
    public MealAttendanceMealResponse meal(UUID actorUserId, UUID propertyId, LocalDate date, MealType mealType) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        List<Row> rows = store.findForMeal(propertyId, date, mealType);
        ZonedDateTime now = now();
        MealAttendanceState state = stateOf(date, mealType, propertyId, now);
        boolean recorded = rows.stream().anyMatch(row -> row.attendedAt() != null);

        Map<UUID, TenancyResponse> tenancies = rows.isEmpty() ? Map.of()
                : tenancyModule.findByIds(rows.stream().map(Row::tenancyId).collect(Collectors.toSet()));
        Set<UUID> roomIds = tenancies.values().stream().map(TenancyResponse::roomId).collect(Collectors.toSet());
        Map<UUID, RoomResponse> rooms = roomIds.isEmpty() ? Map.of()
                : propertyModule.findRoomsForDisplay(propertyId, roomIds);
        Map<UUID, FoodProfile> profiles = profileRepository.findAllById(
                        rows.stream().map(Row::profileId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(FoodProfile::getId, Function.identity()));

        List<MealAttendanceMealResponse.Person> people = rows.stream().map(row -> {
            TenancyResponse tenancy = tenancies.get(row.tenancyId());
            RoomResponse room = tenancy == null ? null : rooms.get(tenancy.roomId());
            FoodProfile profile = profiles.get(row.profileId());
            return new MealAttendanceMealResponse.Person(
                    row.tenancyId(),
                    tenancy == null ? null : tenancy.tenantName(),
                    tenancy == null ? null : tenancy.tenantPhotoUrl(),
                    room == null ? null : room.roomNumber(),
                    profile == null ? null : profile.getName(),
                    row.attendedAt());
        }).toList();

        List<MealAttendanceMealResponse.Person> attended = people.stream()
                .filter(person -> person.attendedAt() != null)
                .sorted(Comparator.comparing(MealAttendanceMealResponse.Person::attendedAt).reversed())
                .toList();
        // A meal nobody scanned has nobody to name: they did not all skip it.
        boolean namesThem = state == MealAttendanceState.OPEN || recorded;
        List<MealAttendanceMealResponse.Person> notAttended = !namesThem ? List.of() : people.stream()
                .filter(person -> person.attendedAt() == null)
                .sorted(Comparator.comparing(
                        MealAttendanceMealResponse.Person::tenantName,
                        Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .toList();
        return new MealAttendanceMealResponse(date, mealType, state, recorded, rows.size(), attended, notAttended);
    }

    /**
     * Calendar days from today back to the first one with anything recorded, so
     * a day when nothing was scanned still shows, as not recorded. One query per
     * page however many tenants there are.
     */
    @Transactional(readOnly = true)
    public MealAttendanceHistoryResponse history(UUID actorUserId, UUID propertyId, int page, int size) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        if (page < 0 || size < 1 || size > 60) {
            throw new ValidationException("Ask for up to 60 days at a time.");
        }
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        Optional<LocalDate> first = store.firstDate(propertyId);
        LocalDate to = today.minusDays((long) page * size);
        if (first.isEmpty() || to.isBefore(first.get())) {
            return new MealAttendanceHistoryResponse(List.of(), false);
        }
        LocalDate oldest = to.minusDays(size - 1L);
        LocalDate from = oldest.isBefore(first.get()) ? first.get() : oldest;
        Map<LocalDate, Map<MealType, MealCount>> counts = byDay(store.counts(propertyId, from, to));

        List<MealAttendanceHistoryResponse.Day> days = new ArrayList<>();
        for (LocalDate date = to; !date.isBefore(from); date = date.minusDays(1)) {
            days.add(new MealAttendanceHistoryResponse.Day(
                    date, mealsOf(date, counts.getOrDefault(date, Map.of()), propertyId, now)));
        }
        return new MealAttendanceHistoryResponse(
                days, from.isAfter(first.get()));
    }

    /** Attended against expected, per food profile and meal, over this week, the last 30 days and this year (user, 2026-11-02). */
    @Transactional(readOnly = true)
    public MealAttendanceAnalyticsResponse analytics(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        ZonedDateTime now = now();
        LocalDate today = now.toLocalDate();
        LocalDate monday = today.with(DayOfWeek.MONDAY);
        LocalDate monthFrom = today.minusDays(MONTH_DAYS);
        LocalDate yearFrom = today.withDayOfYear(1);
        List<MealType> notOver = statesToday(propertyId, now).entrySet().stream()
                .filter(state -> state.getValue() != MealAttendanceState.DONE)
                .map(Map.Entry::getKey)
                .toList();

        List<PlanMealCount> week = store.planMeals(propertyId, monday, today, Grain.DAY, notOver);
        List<PlanMealCount> month = store.planMeals(propertyId, monthFrom, today, Grain.WEEK, notOver);
        List<PlanMealCount> year = store.planMeals(propertyId, yearFrom, today, Grain.MONTH, notOver);

        Set<UUID> planIds = Stream.of(week, month, year).flatMap(List::stream).map(PlanMealCount::profileId).collect(Collectors.toSet());
        Map<UUID, String> names = profileRepository.findAllById(planIds).stream()
                .collect(Collectors.toMap(FoodProfile::getId, FoodProfile::getName));
        List<MealAttendanceAnalyticsResponse.Plan> plans = planIds.stream()
                .map(plan -> new MealAttendanceAnalyticsResponse.Plan(plan, names.getOrDefault(plan, "Plan"),
                        MealScheduleRules.CHRONOLOGICAL.stream()
                                .filter(meal -> Stream.of(week, month, year).flatMap(List::stream)
                                        .anyMatch(cell -> cell.profileId().equals(plan) && cell.mealType() == meal))
                                .map(meal -> new MealAttendanceAnalyticsResponse.Meal(meal,
                                        cells(week, plan, meal), cells(month, plan, meal), cells(year, plan, meal)))
                                .toList()))
                .sorted(Comparator.comparing(MealAttendanceAnalyticsResponse.Plan::name))
                .toList();

        return new MealAttendanceAnalyticsResponse(
                Stream.iterate(monday, date -> date.plusDays(1)).limit(7).toList(),
                Stream.iterate(monthFrom.with(DayOfWeek.MONDAY), date -> !date.isAfter(today), date -> date.plusWeeks(1)).toList(),
                Stream.iterate(yearFrom, date -> !date.isAfter(today), date -> date.plusMonths(1)).toList(),
                plans);
    }

    private static List<MealAttendanceAnalyticsResponse.Cell> cells(List<PlanMealCount> counts, UUID plan, MealType meal) {
        return counts.stream()
                .filter(count -> count.profileId().equals(plan) && count.mealType() == meal)
                .map(count -> new MealAttendanceAnalyticsResponse.Cell(count.period(), count.attended(), count.expected()))
                .sorted(Comparator.comparing(MealAttendanceAnalyticsResponse.Cell::date))
                .toList();
    }

    private List<MealAttendanceDayResponse.Meal> mealsOf(
            LocalDate date, Map<MealType, MealCount> counts, UUID propertyId, ZonedDateTime now) {
        Set<MealType> meals = EnumSet.noneOf(MealType.class);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (property.foodIncluded() && property.includedMeals() != null) {
            meals.addAll(property.includedMeals());
        }
        // A meal since dropped from the property's list still has its history.
        meals.addAll(counts.keySet());
        boolean isToday = date.equals(now.toLocalDate());
        Map<MealType, MealAttendanceState> today = isToday ? statesToday(propertyId, now) : Map.of();
        Map<MealType, String> times = isToday ? timesToday(propertyId) : Map.of();
        return MealScheduleRules.CHRONOLOGICAL.stream()
                .filter(meals::contains)
                .map(meal -> {
                    MealCount count = counts.get(meal);
                    long attended = count == null ? 0 : count.attended();
                    long expected = count == null ? 0 : count.expected();
                    MealAttendanceState state = today.getOrDefault(meal, MealAttendanceState.DONE);
                    boolean recorded = attended > 0;
                    long skipped = state == MealAttendanceState.DONE && recorded ? expected - attended : 0;
                    return new MealAttendanceDayResponse.Meal(meal, state, recorded, attended, expected, skipped, times.get(meal));
                })
                .toList();
    }

    private Map<MealType, String> timesToday(UUID propertyId) {
        Map<MealType, String> times = new EnumMap<>(MealType.class);
        for (MealSlot slot : scheduleService.todaySlots(propertyId)) {
            times.put(slot.mealType(), MealScheduleRules.clock(slot.start()) + " to " + MealScheduleRules.clock(slot.end()));
        }
        return times;
    }

    private MealAttendanceState stateOf(LocalDate date, MealType meal, UUID propertyId, ZonedDateTime now) {
        if (!date.equals(now.toLocalDate())) {
            return date.isAfter(now.toLocalDate()) ? MealAttendanceState.UPCOMING : MealAttendanceState.DONE;
        }
        return statesToday(propertyId, now).getOrDefault(meal, MealAttendanceState.DONE);
    }

    private Map<MealType, MealAttendanceState> statesToday(UUID propertyId, ZonedDateTime now) {
        Map<MealType, MealAttendanceState> states = new EnumMap<>(MealType.class);
        for (MealSlot slot : scheduleService.todaySlots(propertyId)) {
            states.put(slot.mealType(), MealScheduleRules.attendanceOpen(slot, now.toLocalTime())
                    ? MealAttendanceState.OPEN
                    : slot.status() == MealStatus.UPCOMING ? MealAttendanceState.UPCOMING : MealAttendanceState.DONE);
        }
        return states;
    }

    private static Map<LocalDate, Map<MealType, MealCount>> byDay(List<MealCount> counts) {
        Map<LocalDate, Map<MealType, MealCount>> days = new HashMap<>();
        for (MealCount count : counts) {
            days.computeIfAbsent(count.mealDate(), date -> new EnumMap<>(MealType.class)).put(count.mealType(), count);
        }
        return days;
    }

    private MealCount countOf(UUID propertyId, LocalDate date, MealType meal) {
        return store.counts(propertyId, date, date).stream()
                .filter(count -> count.mealType() == meal)
                .findFirst()
                .orElse(new MealCount(date, meal, 0, 0));
    }

    // ---- The roster --------------------------------------------------------

    /** The switch's row when attendance can run here, null otherwise. */
    private FoodModuleSetting setting(UUID propertyId) {
        if (!moduleSettingService.isUsable(propertyId)) {
            return null;
        }
        return settingRepository.findById(propertyId).filter(FoodModuleSetting::isAttendanceEnabled).orElse(null);
    }

    /**
     * Whether this meal is recorded: it started with the switch on. A meal
     * already running when the switch went on is left alone, unless it already
     * has rows, so an accidental off and on does not end it part way through.
     */
    private boolean counts(FoodModuleSetting setting, UUID propertyId, LocalDate today, MealSlot slot) {
        Instant start = today.atTime(slot.start()).atZone(MealScheduleRules.ZONE).toInstant();
        Instant enabledAt = setting.getAttendanceEnabledAt();
        return enabledAt == null || !start.isBefore(enabledAt) || store.existsForMeal(propertyId, today, slot.mealType());
    }

    private boolean hasDishes(UUID propertyId, LocalDate date, MealType meal, UUID profileId) {
        return servedProfiles(propertyId, date, meal).contains(profileId);
    }

    private Set<UUID> servedProfiles(UUID propertyId, LocalDate date, MealType meal) {
        return menuEntryRepository
                .findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(propertyId, date.getDayOfWeek(), meal)
                .stream()
                .map(FoodMenuEntry::getProfileId)
                .collect(Collectors.toSet());
    }

    private Row rowFor(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId) {
        Optional<Row> row = store.findForTenancy(propertyId, date, meal, tenancyId);
        if (row.isPresent()) {
            return row.get();
        }
        ensureRoster(propertyId, date, meal);
        return store.findForTenancy(propertyId, date, meal, tenancyId).orElse(null);
    }

    /** Writes whoever is missing from the meal's roster, with a pass each. */
    private void ensureRoster(UUID propertyId, LocalDate date, MealType meal) {
        Set<UUID> served = servedProfiles(propertyId, date, meal);
        // Away on a declared stay out: not expected, no pass (user, 2026-11-08).
        // Back early and the return changed, the next ask writes them in.
        Set<UUID> away = tenancyModule.awayTenancyIds(propertyId, date, meal);
        List<FoodSubscription> plans = subscriptionRepository.findCovering(propertyId, date).stream()
                .filter(plan -> served.contains(plan.profileOn(date)))
                .filter(plan -> !away.contains(plan.getTenancyId()))
                .toList();
        for (int attempt = 0; attempt < ROSTER_TRIES; attempt++) {
            List<Row> existing = store.findForMeal(propertyId, date, meal);
            Set<UUID> have = existing.stream().map(Row::tenancyId).collect(Collectors.toSet());
            Set<String> usedCodes = existing.stream().map(Row::passCode).collect(Collectors.toCollection(HashSet::new));
            List<NewRow> missing = plans.stream()
                    .filter(plan -> !have.contains(plan.getTenancyId()))
                    .map(plan -> new NewRow(plan.getTenancyId(), plan.getTenantUserId(), plan.profileOn(date),
                            newToken(), newCode(usedCodes)))
                    .toList();
            if (missing.isEmpty()) {
                return;
            }
            store.insertMissing(propertyId, date, meal, missing);
        }
    }

    // ---- Small things ------------------------------------------------------

    /** The meal being served before one still in its ten minutes. Otherwise in meal order. */
    private static List<MealSlot> openFirst(List<MealSlot> slots) {
        List<MealSlot> ordered = new ArrayList<>(slots);
        ordered.sort(Comparator.comparingInt(slot -> slot.status() == MealStatus.SERVING ? 0 : 1));
        return ordered;
    }

    private MealPassResponse pass(
            UUID propertyId, LocalDate date, MealSlot slot, UUID profileId, MealPassState state,
            String token, String code, Instant attendedAt) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        FoodProfile profile = profileRepository.findById(profileId).orElse(null);
        return new MealPassResponse(
                state, property.name(), date, slot.mealType(), slot.start(), slot.end(),
                profile == null ? null : profile.getName(), token, code, attendedAt);
    }

    private ZonedDateTime now() {
        return ZonedDateTime.now(clock).withZoneSameInstant(MealScheduleRules.ZONE);
    }

    private static String newToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        StringBuilder token = new StringBuilder(48);
        for (byte value : bytes) {
            token.append(String.format("%02x", value));
        }
        return token.toString();
    }

    /** Six digits, not starting with a zero, not already on a pass for this meal. */
    private static String newCode(Set<String> used) {
        String code;
        do {
            code = String.valueOf(100_000 + RANDOM.nextInt(900_000));
        } while (!used.add(code));
        return code;
    }
}
