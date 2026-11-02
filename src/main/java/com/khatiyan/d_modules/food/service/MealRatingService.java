package com.khatiyan.d_modules.food.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.MealRatingPromptResponse;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.Cell;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.DishGroup;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.DishPeriod;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.DishRating;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.MealAnalytics;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.Overall;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.PlanAnalytics;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.Point;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse.Trend;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisResponse;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisResponse.Reading;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisStatusResponse;
import com.khatiyan.d_modules.food.api.dto.SubmitMealRatingRequest;
import com.khatiyan.d_modules.food.model.FoodDailySkip;
import com.khatiyan.d_modules.food.model.FoodDishType;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodDailySkipRepository;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.food.repository.MealAttendanceStore;
import com.khatiyan.d_modules.food.repository.MealRatingStore;
import com.khatiyan.d_modules.food.repository.MealRatingStore.DayRating;
import com.khatiyan.d_modules.food.repository.MealRatingStore.DishPeriodRating;
import com.khatiyan.d_modules.food.repository.MealRatingStore.DishPlanRating;
import com.khatiyan.d_modules.food.repository.MealRatingStore.Grain;
import com.khatiyan.d_modules.food.repository.MealRatingStore.NewRating;
import com.khatiyan.d_modules.food.repository.MealRatingStore.PlanMealCell;
import com.khatiyan.d_modules.food.repository.MealRatingStore.PlanRating;
import com.khatiyan.d_modules.food.repository.MealRatingStore.Review;
import com.khatiyan.d_modules.food.service.MealRatingRules.LastMeal;
import com.khatiyan.d_modules.intelligence.IntelligenceModule;
import com.khatiyan.d_modules.intelligence.MealReviewBrief;
import com.khatiyan.d_modules.intelligence.MealReviewReading;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Meal ratings (user, 2026-11-01). A tenant rates the dishes of their last meal, an
 * owner sees the averages every day, and once a week the owner can ask the AI to read
 * what was written.
 *
 * <p>An owner never gets a person's rating, a person's words or who rated: only
 * averages and the AI's reading. Written reviews exist to be read by the AI.
 */
@Service
public class MealRatingService {

    private static final int RATING_DAYS = 30;
    private static final int ANALYSIS_WEEK = 7;
    private static final int MAX_REVIEW_CHARS = 300;
    /** Groq's free tier allows 8K tokens a minute, and 12,000 characters is about 3,000 of them. */
    private static final int MAX_REVIEWS_READ = 150;
    private static final int MAX_REVIEW_INPUT_CHARS = 12_000;

    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final IntelligenceModule intelligenceModule;
    private final FoodAccessPolicy accessPolicy;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final FoodMenuEntryRepository menuEntryRepository;
    private final FoodDailySkipRepository dailySkipRepository;
    private final FoodItemRepository itemRepository;
    private final FoodProfileRepository profileRepository;
    private final MealScheduleService scheduleService;
    private final MealAttendanceStore attendanceStore;
    private final MealRatingStore store;
    private final MealReviewAnalysisCache analysisCache;
    private final Clock clock;
    private final boolean weeklyLimit;

    public MealRatingService(
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            IntelligenceModule intelligenceModule,
            FoodAccessPolicy accessPolicy,
            FoodModuleSettingService moduleSettingService,
            FoodSubscriptionRepository subscriptionRepository,
            FoodMenuEntryRepository menuEntryRepository,
            FoodDailySkipRepository dailySkipRepository,
            FoodItemRepository itemRepository,
            FoodProfileRepository profileRepository,
            MealScheduleService scheduleService,
            MealAttendanceStore attendanceStore,
            MealRatingStore store,
            MealReviewAnalysisCache analysisCache,
            Clock clock,
            @Value("${app.food.ratings.weekly-analysis-limit:true}") boolean weeklyLimit) {
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.intelligenceModule = intelligenceModule;
        this.accessPolicy = accessPolicy;
        this.moduleSettingService = moduleSettingService;
        this.subscriptionRepository = subscriptionRepository;
        this.menuEntryRepository = menuEntryRepository;
        this.dailySkipRepository = dailySkipRepository;
        this.itemRepository = itemRepository;
        this.profileRepository = profileRepository;
        this.scheduleService = scheduleService;
        this.attendanceStore = attendanceStore;
        this.store = store;
        this.analysisCache = analysisCache;
        this.clock = clock;
        this.weeklyLimit = weeklyLimit;
    }

    // ---- The tenant --------------------------------------------------------

    private record Offer(TenancyResponse tenancy, LocalDate date, MealType meal, UUID profileId,
            List<MealRatingPromptResponse.Dish> dishes) {
    }

    /** The meal this tenant can rate now, or null. */
    @Transactional(readOnly = true)
    public MealRatingPromptResponse myPrompt(UUID tenantUserId) {
        return offer(tenantUserId)
                .map(offer -> new MealRatingPromptResponse(offer.date(), offer.meal(), offer.dishes()))
                .orElse(null);
    }

    @Transactional
    public void submit(UUID tenantUserId, SubmitMealRatingRequest request) {
        Offer offer = offer(tenantUserId)
                .filter(found -> found.date().equals(request.date()) && found.meal() == request.mealType())
                .orElseThrow(() -> new ValidationException("This meal can no longer be rated."));
        List<SubmitMealRatingRequest.Entry> entries = request.ratings() == null ? List.of() : request.ratings();
        if (entries.isEmpty()) {
            throw new ValidationException("Rate at least one dish.");
        }
        Set<UUID> onTheirPlan = offer.dishes().stream()
                .map(MealRatingPromptResponse.Dish::itemId)
                .collect(Collectors.toSet());
        Set<UUID> seen = new HashSet<>();
        List<NewRating> ratings = new ArrayList<>();
        for (SubmitMealRatingRequest.Entry entry : entries) {
            if (entry.itemId() == null || !onTheirPlan.contains(entry.itemId()) || !seen.add(entry.itemId())) {
                throw new ValidationException("That dish was not on your plan at this meal.");
            }
            if (entry.rating() == null || entry.rating() < 1 || entry.rating() > 5) {
                throw new ValidationException("A rating is a whole number from 1 to 5.");
            }
            String review = entry.review() == null || entry.review().isBlank() ? null : entry.review().strip();
            if (review != null && review.length() > MAX_REVIEW_CHARS) {
                throw new ValidationException("A review can be up to " + MAX_REVIEW_CHARS + " characters.");
            }
            ratings.add(new NewRating(entry.itemId(), entry.rating(), review));
        }
        int inserted = store.insert(offer.tenancy().propertyId(), offer.date(), offer.meal(), offer.tenancy().id(),
                tenantUserId, offer.profileId(), ratings);
        if (inserted == 0) {
            throw new ValidationException("You have already rated this meal.");
        }
    }

    /**
     * Who may rate (user, 2026-11-01): with scans at that meal, only those scanned.
     * With none, because attendance is off or nobody scanned, everyone on a plan with
     * dishes at it. A forgotten scanner should not silence a whole meal.
     */
    private Optional<Offer> offer(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId).orElse(null);
        if (tenancy == null || !moduleSettingService.isUsable(tenancy.propertyId())) {
            return Optional.empty();
        }
        UUID propertyId = tenancy.propertyId();
        ZonedDateTime now = now();
        LastMeal last = MealRatingRules.lastMeal(
                scheduleService.todaySlots(propertyId), now.toLocalDate(), now.toLocalTime()).orElse(null);
        if (last == null) {
            return Optional.empty();
        }
        LocalDate date = last.date();
        MealType meal = last.mealType();
        FoodSubscription plan = subscriptionRepository.findCoveringForTenancy(tenancy.id(), date).orElse(null);
        UUID profileId = plan == null ? null : plan.profileOn(date);
        if (profileId == null) {
            return Optional.empty();
        }
        Set<UUID> takenOff = dailySkipRepository.findByPropertyIdAndSkipDateAndMealType(propertyId, date, meal).stream()
                .map(FoodDailySkip::getItemId)
                .collect(Collectors.toSet());
        List<UUID> items = menuEntryRepository
                .findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(propertyId, date.getDayOfWeek(), meal)
                .stream()
                .filter(entry -> entry.getProfileId().equals(profileId))
                .map(FoodMenuEntry::getItemId)
                .filter(item -> !takenOff.contains(item))
                .distinct()
                .toList();
        if (items.isEmpty()) {
            return Optional.empty();
        }
        List<MealAttendanceStore.Row> roster = attendanceStore.findForMeal(propertyId, date, meal);
        boolean scanned = roster.stream().anyMatch(row -> row.attendedAt() != null);
        boolean ate = roster.stream().anyMatch(row -> row.tenancyId().equals(tenancy.id()) && row.attendedAt() != null);
        if ((scanned && !ate) || store.hasRated(propertyId, date, meal, tenancy.id())) {
            return Optional.empty();
        }
        Map<UUID, FoodItem> byId = itemRepository.findAllById(items).stream()
                .collect(Collectors.toMap(FoodItem::getId, Function.identity()));
        List<MealRatingPromptResponse.Dish> dishes = items.stream()
                .filter(byId::containsKey)
                .map(item -> new MealRatingPromptResponse.Dish(item, byId.get(item).getName()))
                .toList();
        return Optional.of(new Offer(tenancy, date, meal, profileId, dishes));
    }

    // ---- The owner's daily view --------------------------------------------

    @Transactional(readOnly = true)
    public MealRatingsSummaryResponse summary(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        LocalDate today = now().toLocalDate();
        LocalDate from = today.minusDays(RATING_DAYS - 1L);
        LocalDate weekFrom = today.minusDays(6);
        LocalDate priorFrom = today.minusDays(13);
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        LocalDate yearStart = today.withDayOfYear(1);

        List<PlanMealCell> weekCells = store.planMeals(propertyId, weekStart, today, Grain.DAY);
        List<PlanMealCell> monthCells = store.planMeals(propertyId, from, today, Grain.WEEK);
        List<PlanMealCell> yearCells = store.planMeals(propertyId, yearStart, today, Grain.MONTH);

        Set<UUID> profileIds = new HashSet<>();
        weekCells.forEach(cell -> profileIds.add(cell.profileId()));
        monthCells.forEach(cell -> profileIds.add(cell.profileId()));
        yearCells.forEach(cell -> profileIds.add(cell.profileId()));
        Map<UUID, String> planNames = profileRepository.findAllById(profileIds).stream()
                .collect(Collectors.toMap(FoodProfile::getId, FoodProfile::getName));
        Map<UUID, Double> planWeek = planRatings(store.plans(propertyId, weekStart, today));
        Map<UUID, Double> planLastWeek = planRatings(store.plans(propertyId, weekStart.minusDays(7), weekStart.minusDays(1)));
        Map<UUID, Double> planMonth = planRatings(store.plans(propertyId, from, today));
        Map<UUID, Double> planYear = planRatings(store.plans(propertyId, yearStart, today));

        return new MealRatingsSummaryResponse(
                overall(propertyId, from, today, weekFrom, priorFrom, weekStart, yearStart),
                profileAnalytics(weekCells, monthCells, yearCells, planNames, planWeek, planLastWeek, planMonth, planYear),
                dishGroups(propertyId, today, from, weekStart, yearStart));
    }

    private Overall overall(UUID propertyId, LocalDate from, LocalDate today, LocalDate weekFrom, LocalDate priorFrom,
            LocalDate weekStart, LocalDate yearStart) {
        List<DayRating> days = store.byDay(propertyId, from, today);
        Double all = average(days, from, today);
        Double week = average(days, weekFrom, today);
        Double prior = average(days, priorFrom, weekFrom.minusDays(1));
        List<DayRating> months = store.byMonth(propertyId, yearStart, today);
        List<Point> monthPoints = new ArrayList<>();
        for (LocalDate month = yearStart; !month.isAfter(today); month = month.plusMonths(1)) {
            monthPoints.add(point(month, months));
        }
        return new Overall(rounded(all), week == null || prior == null ? null : round(week - prior),
                trend(days, weekStart, weekStart.plusDays(6), today),
                monthByWeek(days, from, today),
                new Trend(rounded(average(months, yearStart, today)), monthPoints));
    }

    /** A point per day, and the days still to come stay empty so a week always shows Monday to Sunday. */
    private static Trend trend(List<DayRating> days, LocalDate from, LocalDate to, LocalDate today) {
        List<Point> points = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            points.add(point(date, days));
        }
        return new Trend(rounded(average(days, from, to.isAfter(today) ? today : to)), points);
    }

    /** The last 30 days as a jump from one week to the next (user, 2026-11-02), each point on its Monday. */
    private static Trend monthByWeek(List<DayRating> days, LocalDate from, LocalDate today) {
        List<Point> points = new ArrayList<>();
        for (LocalDate monday = from.with(DayOfWeek.MONDAY); !monday.isAfter(today); monday = monday.plusWeeks(1)) {
            LocalDate start = monday.isBefore(from) ? from : monday;
            LocalDate end = monday.plusDays(6).isAfter(today) ? today : monday.plusDays(6);
            points.add(new Point(monday, rounded(average(days, start, end))));
        }
        return new Trend(rounded(average(days, from, today)), points);
    }

    private static Point point(LocalDate date, List<DayRating> rows) {
        return rows.stream()
                .filter(row -> row.date().equals(date))
                .findFirst()
                .map(row -> new Point(date, round(row.sum() / row.people())))
                .orElse(new Point(date, null));
    }

    private static List<PlanAnalytics> profileAnalytics(List<PlanMealCell> weekCells, List<PlanMealCell> monthCells,
            List<PlanMealCell> yearCells, Map<UUID, String> planNames,
            Map<UUID, Double> planWeek, Map<UUID, Double> planLastWeek, Map<UUID, Double> planMonth, Map<UUID, Double> planYear) {
        Set<UUID> plans = new HashSet<>();
        yearCells.forEach(cell -> plans.add(cell.profileId()));
        monthCells.forEach(cell -> plans.add(cell.profileId()));
        weekCells.forEach(cell -> plans.add(cell.profileId()));
        return plans.stream()
                .map(plan -> new PlanAnalytics(plan, planNames.getOrDefault(plan, "Plan"),
                        planWeek.get(plan), planLastWeek.get(plan), planMonth.get(plan), planYear.get(plan),
                        MealScheduleRules.CHRONOLOGICAL.stream()
                                .filter(meal -> Stream.of(weekCells, monthCells, yearCells).flatMap(List::stream)
                                        .anyMatch(cell -> cell.profileId().equals(plan) && cell.mealType() == meal))
                                .map(meal -> new MealAnalytics(meal, cells(weekCells, plan, meal), cells(monthCells, plan, meal), cells(yearCells, plan, meal)))
                                .toList()))
                .sorted(Comparator.comparing(PlanAnalytics::name))
                .toList();
    }

    private static Map<UUID, Double> planRatings(List<PlanRating> rows) {
        return rows.stream().collect(Collectors.toMap(PlanRating::profileId, row -> round(row.rating())));
    }

    private static List<Cell> cells(List<PlanMealCell> rows, UUID plan, MealType meal) {
        return rows.stream()
                .filter(row -> row.profileId().equals(plan) && row.mealType() == meal)
                .sorted(Comparator.comparing(PlanMealCell::period))
                .map(row -> new Cell(row.period(), round(row.rating()), row.people()))
                .toList();
    }

    /** Common dishes, drinks, veg, non veg, each dish once, with its rating over each duration. */
    private List<DishGroup> dishGroups(UUID propertyId, LocalDate today, LocalDate from, LocalDate weekStart, LocalDate yearStart) {
        Map<UUID, DishPeriodRating> week = byItem(store.dishPeriods(propertyId, weekStart, today, weekStart.minusDays(7), today.minusDays(7)));
        LocalDate lastMonday = weekStart.minusDays(7);
        LocalDate lastSunday = weekStart.minusDays(1);
        Map<UUID, DishPeriodRating> lastWeek = byItem(store.dishPeriods(propertyId, lastMonday, lastSunday, lastMonday.minusDays(7), lastMonday.minusDays(1)));
        Map<UUID, DishPeriodRating> month = byItem(store.dishPeriods(propertyId, from, today, from.minusDays(RATING_DAYS), from.minusDays(1)));
        Map<UUID, DishPeriodRating> year = byItem(store.dishPeriods(propertyId, yearStart, today, yearStart.minusYears(1), today.minusYears(1)));
        Set<UUID> rated = new HashSet<>();
        Stream.of(week, lastWeek, month, year).forEach(period -> period.forEach((item, row) -> {
            if (row.count() > 0) {
                rated.add(item);
            }
        }));
        Map<UUID, FoodItem> items = itemRepository.findAllById(rated).stream()
                .collect(Collectors.toMap(FoodItem::getId, Function.identity()));
        List<DishGroup> groups = new ArrayList<>();
        for (FoodDishType type : List.of(FoodDishType.COMMON, FoodDishType.DRINK, FoodDishType.VEG, FoodDishType.NON_VEG)) {
            List<DishRating> group = items.values().stream()
                    .filter(item -> item.getDishType() == type)
                    .map(item -> new DishRating(item.getId(), item.getName(), period(week.get(item.getId())),
                            period(lastWeek.get(item.getId())).rating(),
                            period(month.get(item.getId())), period(year.get(item.getId()))))
                    .sorted(Comparator.comparing(DishRating::name))
                    .toList();
            if (!group.isEmpty()) {
                groups.add(new DishGroup(type, group));
            }
        }
        return groups;
    }

    private static Map<UUID, DishPeriodRating> byItem(List<DishPeriodRating> rows) {
        return rows.stream().collect(Collectors.toMap(DishPeriodRating::itemId, Function.identity()));
    }

    private static DishPeriod period(DishPeriodRating row) {
        if (row == null || row.count() == 0) {
            return new DishPeriod(null, null);
        }
        double rating = row.sum() / row.count();
        return new DishPeriod(round(rating), row.priorCount() == 0 ? null : round(rating - row.priorSum() / row.priorCount()));
    }

    private static Double average(List<DayRating> days, LocalDate from, LocalDate to) {
        double sum = 0;
        long people = 0;
        for (DayRating day : days) {
            if (!day.date().isBefore(from) && !day.date().isAfter(to)) {
                sum += day.sum();
                people += day.people();
            }
        }
        return people == 0 ? null : sum / people;
    }

    // ---- The weekly AI reading ---------------------------------------------

    public MealReviewAnalysisStatusResponse analysisStatus(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        MealReviewAnalysisResponse current = current(propertyId, now().toLocalDate());
        boolean owner = propertyModule.permissionsFor(actorUserId, propertyId).owner();
        return new MealReviewAnalysisStatusResponse(current, owner, owner && (current == null || !weeklyLimit));
    }

    /**
     * One a week, owner only (user, 2026-11-01). Not in a transaction, because it
     * waits on a provider. Nothing is stored until the reading is back, so a failure
     * keeps the owner's turn. With nothing written there is nothing for the AI to
     * read: the lines come from the ratings, and the turn is kept for a week that has
     * words in it.
     */
    public MealReviewAnalysisResponse generate(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureOwner(actorUserId, propertyId);
        moduleSettingService.requireUsable(propertyId);
        LocalDate today = now().toLocalDate();
        MealReviewAnalysisResponse current = current(propertyId, today);
        if (current != null && weeklyLimit) {
            return current;
        }
        LocalDate from = today.minusDays(ANALYSIS_WEEK);
        List<Review> reviews = capped(store.reviews(propertyId, from, today, MAX_REVIEWS_READ));
        List<DishPlanRating> dishes = store.dishes(propertyId, from, today, from, from);
        List<PlanRating> plans = store.plans(propertyId, from, today);
        if (reviews.isEmpty()) {
            return analysis(false, null, null, 0, plans, dishes, Map.of(), Map.of());
        }
        if (!intelligenceModule.isEnabled()) {
            throw new ValidationException("The AI analysis is not available right now.");
        }

        Map<UUID, String> planKeys = keys("P", reviews.stream().map(Review::profileId).toList());
        Map<UUID, String> dishKeys = keys("D", reviews.stream().map(Review::itemId).toList());
        Map<String, MealReviewReading> readings;
        try {
            readings = intelligenceModule.readMealReviews(brief(reviews, planKeys, dishKeys), actorUserId, propertyId).stream()
                    .collect(Collectors.toMap(MealReviewReading::key, Function.identity(), (first, second) -> first));
        } catch (RuntimeException failed) {
            throw new ValidationException("The AI analysis could not run. Try again, this week's turn was not used.");
        }

        LocalDate expiresOn = today.plusDays(ANALYSIS_WEEK);
        MealReviewAnalysisResponse analysis = analysis(true, today, expiresOn, reviews.size(), plans, dishes,
                readingsFor(planKeys, readings), readingsFor(dishKeys, readings));
        String json = JSON.writeValueAsString(analysis);
        if (!weeklyLimit) {
            store.replaceAnalysis(propertyId, today, expiresOn, actorUserId, json);
        } else if (!store.insertAnalysis(propertyId, today, expiresOn, actorUserId, json)) {
            MealReviewAnalysisResponse winner = current(propertyId, today);
            return winner != null ? winner : analysis;
        }
        analysisCache.put(propertyId, json, untilExpiry(expiresOn));
        return analysis;
    }

    /** The analysis in its week, from the cache or else the table. Null once the week is over. */
    private MealReviewAnalysisResponse current(UUID propertyId, LocalDate today) {
        Optional<MealReviewAnalysisResponse> cached = analysisCache.get(propertyId)
                .flatMap(MealRatingService::parse)
                .filter(analysis -> analysis.expiresOn() != null && analysis.expiresOn().isAfter(today));
        if (cached.isPresent()) {
            return cached.get();
        }
        Optional<String> stored = store.currentAnalysis(propertyId, today);
        Optional<MealReviewAnalysisResponse> parsed = stored.flatMap(MealRatingService::parse);
        if (parsed.isEmpty()) {
            return null;
        }
        analysisCache.put(propertyId, stored.get(), untilExpiry(parsed.get().expiresOn()));
        return parsed.get();
    }

    private static Optional<MealReviewAnalysisResponse> parse(String json) {
        try {
            return Optional.ofNullable(JSON.readValue(json, MealReviewAnalysisResponse.class));
        } catch (RuntimeException unreadable) {
            return Optional.empty();
        }
    }

    private Duration untilExpiry(LocalDate expiresOn) {
        return Duration.between(clock.instant(), expiresOn.atStartOfDay(MealScheduleRules.ZONE).toInstant());
    }

    /** In the store's order, up to what fits the provider's limit. */
    private static List<Review> capped(List<Review> reviews) {
        List<Review> kept = new ArrayList<>();
        int chars = 0;
        for (Review review : reviews) {
            chars += review.text().length();
            if (chars > MAX_REVIEW_INPUT_CHARS) {
                break;
            }
            kept.add(review);
        }
        return kept;
    }

    private static Map<UUID, String> keys(String prefix, List<UUID> ids) {
        Map<UUID, String> keys = new LinkedHashMap<>();
        ids.forEach(id -> keys.computeIfAbsent(id, unused -> prefix + (keys.size() + 1)));
        return keys;
    }

    private MealReviewBrief brief(List<Review> reviews, Map<UUID, String> planKeys, Map<UUID, String> dishKeys) {
        Map<UUID, String> planNames = profileRepository.findAllById(planKeys.keySet()).stream()
                .collect(Collectors.toMap(FoodProfile::getId, FoodProfile::getName));
        Map<UUID, String> dishNames = itemRepository.findAllById(dishKeys.keySet()).stream()
                .collect(Collectors.toMap(FoodItem::getId, FoodItem::getName));
        return new MealReviewBrief(
                planKeys.entrySet().stream()
                        .map(entry -> new MealReviewBrief.Subject(entry.getValue(), planNames.getOrDefault(entry.getKey(), "Plan")))
                        .toList(),
                dishKeys.entrySet().stream()
                        .map(entry -> new MealReviewBrief.Subject(entry.getValue(), dishNames.getOrDefault(entry.getKey(), "Dish")))
                        .toList(),
                reviews.stream()
                        .map(review -> new MealReviewBrief.Review(planKeys.get(review.profileId()), dishKeys.get(review.itemId()), review.text()))
                        .toList());
    }

    private static Map<UUID, MealReviewReading> readingsFor(Map<UUID, String> keys, Map<String, MealReviewReading> readings) {
        Map<UUID, MealReviewReading> byId = new HashMap<>();
        keys.forEach((id, key) -> {
            if (readings.containsKey(key)) {
                byId.put(id, readings.get(key));
            }
        });
        return byId;
    }

    /** The AI's reading where it has one, else the line the rating gives. */
    private MealReviewAnalysisResponse analysis(boolean stored, LocalDate generatedOn, LocalDate expiresOn, int reviewsRead,
            List<PlanRating> plans, List<DishPlanRating> dishes,
            Map<UUID, MealReviewReading> planReadings, Map<UUID, MealReviewReading> dishReadings) {
        Map<UUID, String> planNames = profileRepository
                .findAllById(plans.stream().map(PlanRating::profileId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(FoodProfile::getId, FoodProfile::getName));
        Map<UUID, String> dishNames = itemRepository
                .findAllById(dishes.stream().map(DishPlanRating::itemId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(FoodItem::getId, FoodItem::getName));
        List<Reading> planLines = plans.stream()
                .map(plan -> reading(plan.profileId(), planNames.getOrDefault(plan.profileId(), "Plan"), plan.rating(),
                        "plan", planReadings.get(plan.profileId())))
                .sorted(Comparator.comparing(Reading::name))
                .toList();
        List<Reading> dishLines = dishes.stream()
                .collect(Collectors.groupingBy(DishPlanRating::itemId))
                .entrySet().stream()
                .map(entry -> {
                    double sum = entry.getValue().stream().mapToDouble(DishPlanRating::sum).sum();
                    long count = entry.getValue().stream().mapToLong(DishPlanRating::count).sum();
                    return reading(entry.getKey(), dishNames.getOrDefault(entry.getKey(), "Dish"), sum / count,
                            "dish", dishReadings.get(entry.getKey()));
                })
                .sorted(Comparator.comparing(Reading::name))
                .toList();
        return new MealReviewAnalysisResponse(stored, generatedOn, expiresOn, reviewsRead, planLines, dishLines);
    }

    private static Reading reading(UUID id, String name, double rating, String noun, MealReviewReading read) {
        if (read != null && read.review() != null) {
            return new Reading(id, name, read.rating(), read.review());
        }
        return new Reading(id, name, Math.round(rating * 10) / 10.0, MealRatingRules.generic(rating, noun));
    }

    private ZonedDateTime now() {
        return ZonedDateTime.now(clock).withZoneSameInstant(MealScheduleRules.ZONE);
    }

    private static Double rounded(Double value) {
        return value == null ? null : round(value);
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }
}
