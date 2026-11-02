package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.food.api.dto.MealRatingPromptResponse;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisResponse;
import com.khatiyan.d_modules.food.api.dto.SubmitMealRatingRequest;
import com.khatiyan.d_modules.food.model.FoodDishType;
import com.khatiyan.d_modules.intelligence.IntelligenceModule;
import com.khatiyan.d_modules.intelligence.MealReviewBrief;
import com.khatiyan.d_modules.intelligence.MealReviewReading;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.support.IntegrationTest;

import tools.jackson.databind.json.JsonMapper;

/**
 * Meal ratings, end to end (user, 2026-11-01). Lunch runs 12:30 to 2:30 and dinner 8
 * to 10 on the default timetable. Two tenants are on Daily veg, with dishes at both,
 * one is on Light, with dishes at dinner only, and one has no plan. Rice is on both
 * plans, paneer on Daily veg alone. The AI is mocked: the provider is not under test.
 */
@IntegrationTest
@Import(MealAttendanceIntegrationTest.ClockOverride.class)
class MealRatingIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private MealRatingService ratings;
    @Autowired private MealAttendanceIntegrationTest.SettableClock clock;
    @MockitoBean private IntelligenceModule intelligence;

    private final LocalDate today = LocalDate.now(IST);

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID manager;
    private UUID first;
    private UUID second;
    private UUID light;
    private UUID noPlan;
    private UUID dailyVeg;
    private UUID lightPlan;
    private UUID rice;
    private UUID paneer;

    @BeforeEach
    void seed() {
        reset(intelligence);
        when(intelligence.isEnabled()).thenReturn(true);
        itIs(15, 0);
        seeded = LargePropertySeeder.seed(jdbc, today, 8, 1, 74L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        manager = manager();

        jdbc.update("""
                DELETE FROM food.food_subscription_days WHERE subscription_id IN
                    (SELECT id FROM food.food_subscriptions WHERE property_id = ?)
                """, property);
        jdbc.update("DELETE FROM food.food_subscriptions WHERE property_id = ?", property);
        jdbc.update("UPDATE property.properties SET food_included = true WHERE id = ?", property);
        for (MealType meal : List.of(MealType.LUNCH, MealType.DINNER)) {
            jdbc.update("INSERT INTO property.property_included_meals (property_id, meal_type) VALUES (?, ?)",
                    property, meal.name());
        }
        jdbc.update("""
                INSERT INTO food.food_module_settings (property_id, is_enabled, created_at, updated_at, version)
                VALUES (?, true, now(), now(), 0)
                """, property);

        dailyVeg = profile("Daily veg");
        lightPlan = profile("Light");
        rice = item("Rice", "COMMON");
        paneer = item("Paneer", "VEG");
        for (DayOfWeek day : List.of(today.getDayOfWeek(), today.minusDays(1).getDayOfWeek())) {
            menu(dailyVeg, rice, day, MealType.LUNCH);
            menu(dailyVeg, paneer, day, MealType.LUNCH);
            menu(dailyVeg, rice, day, MealType.DINNER);
            menu(lightPlan, rice, day, MealType.DINNER);
        }

        List<Map<String, Object>> stays = jdbc.queryForList(
                "SELECT id, user_id FROM tenancy.tenancies WHERE property_id = ? AND is_active ORDER BY reference_code",
                property);
        first = plan(stays.get(0), dailyVeg);
        second = plan(stays.get(1), dailyVeg);
        light = plan(stays.get(2), lightPlan);
        noPlan = (UUID) stays.get(3).get("user_id");
    }

    @AfterEach
    void remove() {
        clock.set(null);
        jdbc.update("DELETE FROM food.food_daily_skips WHERE property_id = ?", property);
        jdbc.update("DELETE FROM food.food_meal_ratings WHERE property_id = ?", property);
        jdbc.update("DELETE FROM food.food_meal_review_analyses WHERE property_id = ?", property);
        jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
        jdbc.update("DELETE FROM auth.users WHERE id = ?", manager);
        LargePropertySeeder.remove(jdbc, seeded);
    }

    // ---- Who can rate, and when --------------------------------------------

    @Test
    void aTenantIsOfferedTheirLastMealWithTheDishesOnTheirPlan() {
        MealRatingPromptResponse prompt = ratings.myPrompt(first);

        assertThat(prompt.mealType()).isEqualTo(MealType.LUNCH);
        assertThat(prompt.date()).isEqualTo(today);
        assertThat(prompt.dishes()).extracting(MealRatingPromptResponse.Dish::name)
                .containsExactlyInAnyOrder("Rice", "Paneer");
    }

    @Test
    void nothingIsOfferedWithoutThatMealOnThePlanOrWithoutAPlan() {
        assertThat(ratings.myPrompt(light)).isNull();
        assertThat(ratings.myPrompt(noPlan)).isNull();
    }

    @Test
    void nothingIsOfferedDuringAMealOrAfterTheNextStarts() {
        itIs(13, 0);
        assertThat(ratings.myPrompt(first)).isNull();
        itIs(20, 0);
        assertThat(ratings.myPrompt(first)).isNull();
    }

    @Test
    void aDishTakenOffThatDateIsNotOffered() {
        jdbc.update("""
                INSERT INTO food.food_daily_skips (id, property_id, item_id, skip_date, meal_type, created_by_user_id,
                    created_at, updated_at, version)
                VALUES (?, ?, ?, ?, 'LUNCH', ?, now(), now(), 0)
                """, UUID.randomUUID(), property, paneer, today, owner);

        assertThat(ratings.myPrompt(first).dishes()).extracting(MealRatingPromptResponse.Dish::name).containsExactly("Rice");
    }

    @Test
    void withScansAtAMealOnlyThoseScannedCanRate() {
        attended(first, dailyVeg, true);
        attended(second, dailyVeg, false);

        assertThat(ratings.myPrompt(first)).isNotNull();
        assertThat(ratings.myPrompt(second)).isNull();
    }

    @Test
    void aMealNobodyScannedCanStillBeRatedByItsSubscribers() {
        attended(first, dailyVeg, false);
        attended(second, dailyVeg, false);

        assertThat(ratings.myPrompt(second)).isNotNull();
    }

    // ---- Submitting --------------------------------------------------------

    @Test
    void oneRatedDishIsEnoughAndTheOfferThenGoesAway() {
        ratings.submit(first, lunch(entry(rice, 4, "  Nice and hot  ")));

        assertThat(ratings.myPrompt(first)).isNull();
        assertThat(jdbc.queryForObject("SELECT review FROM food.food_meal_ratings WHERE user_id = ?", String.class, first))
                .isEqualTo("Nice and hot");
        assertThat(jdbc.queryForObject("SELECT profile_id FROM food.food_meal_ratings WHERE user_id = ?", UUID.class, first))
                .isEqualTo(dailyVeg);
    }

    @Test
    void aMealCanBeRatedOnce() {
        ratings.submit(first, lunch(entry(rice, 4, null)));

        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(paneer, 5, null))))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void aBadSubmissionIsRefused() {
        assertThatThrownBy(() -> ratings.submit(first, lunch())).hasMessageContaining("at least one");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(rice, 6, null)))).hasMessageContaining("1 to 5");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(rice, 0, null)))).hasMessageContaining("1 to 5");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(rice, null, null)))).hasMessageContaining("1 to 5");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(UUID.randomUUID(), 4, null)))).hasMessageContaining("not on your plan");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(rice, 4, null), entry(rice, 5, null)))).hasMessageContaining("not on your plan");
        assertThatThrownBy(() -> ratings.submit(first, lunch(entry(rice, 4, "x".repeat(301))))).hasMessageContaining("300");
    }

    @Test
    void aMealNoLongerOnOfferCannotBeRated() {
        assertThatThrownBy(() -> ratings.submit(first, new SubmitMealRatingRequest(today.minusDays(1), MealType.LUNCH,
                List.of(entry(rice, 4, null))))).hasMessageContaining("no longer");
    }

    // ---- The owner's numbers -----------------------------------------------

    @Test
    void aPlansMealRatingAveragesItsPeopleNotItsDishes() {
        rating(today, first, dailyVeg, rice, 5, null);
        rating(today, first, dailyVeg, paneer, 3, null);
        rating(today, second, dailyVeg, rice, 2, null);

        MealRatingsSummaryResponse summary = ratings.summary(owner, property);

        assertThat(summary.profileAnalytics()).hasSize(1);
        MealRatingsSummaryResponse.MealAnalytics lunch = summary.profileAnalytics().get(0).meals().get(0);
        assertThat(lunch.mealType()).isEqualTo(MealType.LUNCH);
        assertThat(lunch.thisWeek().get(0).date()).isEqualTo(today);
        assertThat(lunch.thisWeek().get(0).rating()).isEqualTo(3.0);
        assertThat(lunch.thisWeek().get(0).people()).isEqualTo(2);
        assertThat(lunch.thisMonth().get(0).date()).isEqualTo(today.with(DayOfWeek.MONDAY));
        assertThat(lunch.thisMonth().get(0).rating()).isEqualTo(3.0);
        assertThat(lunch.thisYear().get(0).date()).isEqualTo(today.withDayOfMonth(1));
        assertThat(lunch.thisYear().get(0).rating()).isEqualTo(3.0);
        assertThat(summary.overall().rating()).isEqualTo(3.0);
    }

    @Test
    void dishesAreGroupedByTheirTypeWithARatingAndChangeForEachDuration() {
        rating(today, first, dailyVeg, rice, 5, null);
        rating(today, light, lightPlan, rice, 2, null);
        rating(today.minusDays(35), first, dailyVeg, rice, 2, null);
        rating(today, first, dailyVeg, paneer, 4, null);

        MealRatingsSummaryResponse summary = ratings.summary(owner, property);

        assertThat(summary.dishGroups()).extracting(MealRatingsSummaryResponse.DishGroup::type)
                .containsExactly(FoodDishType.COMMON, FoodDishType.VEG);
        MealRatingsSummaryResponse.DishRating common = summary.dishGroups().get(0).dishes().get(0);
        assertThat(common.name()).isEqualTo("Rice");
        assertThat(common.thisWeek().rating()).isEqualTo(3.5);
        assertThat(common.thisWeek().change()).isNull();
        assertThat(common.thisMonth().rating()).isEqualTo(3.5);
        assertThat(common.thisMonth().change()).isEqualTo(1.5);
        assertThat(common.lastWeek()).isNull();
        assertThat(summary.dishGroups().get(1).dishes().get(0).name()).isEqualTo("Paneer");
    }

    @Test
    void lastWeekIsTheWholeWeekBeforeThisOne() {
        LocalDate lastMonday = today.with(DayOfWeek.MONDAY).minusDays(7);
        rating(lastMonday, first, dailyVeg, rice, 2, null);
        rating(lastMonday.plusDays(6), second, dailyVeg, rice, 4, null);

        MealRatingsSummaryResponse summary = ratings.summary(owner, property);

        assertThat(summary.profileAnalytics().get(0).ratingLastWeek()).isEqualTo(3.0);
        assertThat(summary.dishGroups().get(0).dishes().get(0).lastWeek()).isEqualTo(3.0);
    }

    @Test
    void aPlanHasItsOwnRatingForEachDuration() {
        rating(today, first, dailyVeg, rice, 5, null);
        rating(today.minusDays(20), first, dailyVeg, rice, 1, null);

        MealRatingsSummaryResponse.PlanAnalytics plan = ratings.summary(owner, property).profileAnalytics().get(0);

        assertThat(plan.ratingThisWeek()).isEqualTo(5.0);
        assertThat(plan.ratingLastWeek()).isNull();
        assertThat(plan.ratingThisMonth()).isEqualTo(3.0);
    }

    @Test
    void theGraphHasThisWeekFromMondayTheLastThirtyDaysByWeekAndEveryMonthOfTheYear() {
        rating(today.minusDays(1), first, dailyVeg, rice, 5, null);
        rating(today.minusDays(9), first, dailyVeg, rice, 3, null);

        MealRatingsSummaryResponse.Overall overall = ratings.summary(owner, property).overall();

        assertThat(overall.changeThisWeek()).isEqualTo(2.0);
        assertThat(overall.thisWeek().points()).hasSize(7);
        assertThat(overall.thisWeek().points().get(0).date().getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY);
        // A point a week, each on its Monday, ending with this week's.
        List<MealRatingsSummaryResponse.Point> weeks = overall.thisMonth().points();
        assertThat(weeks).hasSizeBetween(5, 6);
        assertThat(weeks).allSatisfy(week -> assertThat(week.date().getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY));
        assertThat(weeks.get(weeks.size() - 1).date()).isEqualTo(today.with(DayOfWeek.MONDAY));
        assertThat(overall.thisMonth().rating()).isEqualTo(4.0);
        assertThat(overall.thisYear().points()).hasSize(today.getMonthValue());
        assertThat(overall.thisYear().points().get(0).date()).isEqualTo(today.withDayOfYear(1));
    }

    @Test
    void anOwnerNeverGetsAnIdANameOrAWrittenWord() {
        UUID tenancy = tenancyOf(first);
        rating(today.minusDays(1), first, dailyVeg, rice, 5, "Secret words");
        when(intelligence.readMealReviews(any(), any(), any())).thenReturn(List.of());
        JsonMapper json = JsonMapper.builder().build();

        String everything = json.writeValueAsString(ratings.summary(owner, property))
                + json.writeValueAsString(ratings.generate(owner, property))
                + json.writeValueAsString(ratings.analysisStatus(owner, property));

        assertThat(everything).doesNotContain("Secret words", first.toString(), tenancy.toString());
    }

    @Test
    void theRatingsAreForThoseWhoCanViewFood() {
        assertThatThrownBy(() -> ratings.summary(manager, property)).isInstanceOf(ForbiddenException.class);
    }

    // ---- The weekly AI reading ---------------------------------------------

    @Test
    void theAiReadsOnlyEachPersonsLatestReviewOfADish() {
        rating(today.minusDays(4), first, dailyVeg, rice, 1, "Burnt, could not eat it");
        rating(today.minusDays(2), first, dailyVeg, rice, 2, "Still too dry");
        rating(today.minusDays(1), first, dailyVeg, rice, 5, "Perfect today");
        rating(today.minusDays(3), light, lightPlan, rice, 3, "A bit cold");
        // Rated since with no words: their last words are still their latest review.
        rating(today.minusDays(3), first, dailyVeg, paneer, 4, "Soft paneer");
        rating(today.minusDays(1), first, dailyVeg, paneer, 4, null);
        ArgumentCaptor<MealReviewBrief> brief = ArgumentCaptor.forClass(MealReviewBrief.class);
        when(intelligence.readMealReviews(brief.capture(), any(), any())).thenReturn(List.of());

        MealReviewAnalysisResponse analysis = ratings.generate(owner, property);

        assertThat(brief.getValue().reviews()).extracting(MealReviewBrief.Review::text)
                .containsExactlyInAnyOrder("Perfect today", "A bit cold", "Soft paneer");
        assertThat(analysis.reviewsRead()).isEqualTo(3);
    }

    @Test
    void generatingReadsTheReviewsAcrossPlansAndKeepsItForTheWeek() {
        rating(today.minusDays(1), first, dailyVeg, rice, 2, "Too dry");
        rating(today.minusDays(1), light, lightPlan, rice, 3, "A bit cold");
        rating(today.minusDays(1), first, dailyVeg, paneer, 5, null);
        ArgumentCaptor<MealReviewBrief> brief = ArgumentCaptor.forClass(MealReviewBrief.class);
        when(intelligence.readMealReviews(brief.capture(), any(), any())).thenAnswer(call -> List.of(
                new MealReviewReading(brief.getValue().dishes().get(0).key(), 2.3, "The Rice is **dry and cold**, and tenants want it served hotter.")));

        MealReviewAnalysisResponse analysis = ratings.generate(owner, property);

        // One key for rice, read across both plans, and no paneer: nobody wrote about it.
        assertThat(brief.getValue().dishes()).extracting(MealReviewBrief.Subject::name).containsExactly("Rice");
        assertThat(brief.getValue().reviews()).hasSize(2);
        assertThat(brief.getValue().plans()).hasSize(2);
        assertThat(brief.getValue().toString()).doesNotContain(first.toString());

        assertThat(analysis.stored()).isTrue();
        assertThat(analysis.reviewsRead()).isEqualTo(2);
        assertThat(analysis.generatedOn()).isEqualTo(today);
        assertThat(analysis.expiresOn()).isEqualTo(today.plusDays(7));
        MealReviewAnalysisResponse.Reading riceReading = reading(analysis, "Rice");
        assertThat(riceReading.rating()).isEqualTo(2.3);
        assertThat(riceReading.line()).isEqualTo("The Rice is **dry and cold**, and tenants want it served hotter.");
        // Nobody wrote about paneer, so its line comes from its rating.
        assertThat(reading(analysis, "Paneer").line()).isEqualTo("This dish is delightful.");
        assertThat(reading(analysis, "Paneer").rating()).isEqualTo(5.0);

        assertThat(ratings.analysisStatus(owner, property).current().generatedOn()).isEqualTo(today);
        assertThat(ratings.analysisStatus(owner, property).canGenerate()).isFalse();
        assertThat(ratings.analysisStatus(owner, property).owner()).isTrue();
        ratings.generate(owner, property);
        verify(intelligence, times(1)).readMealReviews(any(), any(), any());
    }

    @Test
    void aWeekWithNoWrittenReviewsCallsNoAiAndKeepsTheTurn() {
        rating(today.minusDays(1), first, dailyVeg, rice, 2, null);

        MealReviewAnalysisResponse analysis = ratings.generate(owner, property);

        verify(intelligence, never()).readMealReviews(any(), any(), any());
        assertThat(analysis.stored()).isFalse();
        assertThat(reading(analysis, "Rice").line()).isEqualTo("This dish is poor.");
        assertThat(ratings.analysisStatus(owner, property).canGenerate()).isTrue();
    }

    @Test
    void aFailureStoresNothingAndKeepsTheTurn() {
        rating(today.minusDays(1), first, dailyVeg, rice, 2, "Too dry");
        when(intelligence.readMealReviews(any(), any(), any())).thenThrow(new IllegalStateException("provider down"));

        assertThatThrownBy(() -> ratings.generate(owner, property))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("was not used");

        assertThat(ratings.analysisStatus(owner, property).canGenerate()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM food.food_meal_review_analyses WHERE property_id = ?",
                Long.class, property)).isZero();
    }

    @Test
    void onlyTheOwnerGenerates() {
        grantFood();
        assertThatThrownBy(() -> ratings.generate(manager, property)).isInstanceOf(ForbiddenException.class);
        assertThat(ratings.analysisStatus(manager, property).canGenerate()).isFalse();
    }

    @Test
    void theAnalysisExpiresOnTheSameWeekdayEvenWithTheCacheStillHoldingIt() {
        rating(today.minusDays(1), first, dailyVeg, rice, 2, "Too dry");
        when(intelligence.readMealReviews(any(), any(), any())).thenReturn(List.of());
        ratings.generate(owner, property);

        clock.set(today.plusDays(6).atTime(23, 0).atZone(IST).toInstant());
        assertThat(ratings.analysisStatus(owner, property).current()).isNotNull();

        clock.set(today.plusDays(7).atTime(0, 1).atZone(IST).toInstant());
        assertThat(ratings.analysisStatus(owner, property).current()).isNull();
        assertThat(ratings.analysisStatus(owner, property).canGenerate()).isTrue();
    }

    @Test
    void theWeeksAnalysisIsServedFromTheCache() {
        rating(today.minusDays(1), first, dailyVeg, rice, 2, "Too dry");
        when(intelligence.readMealReviews(any(), any(), any())).thenReturn(List.of());
        ratings.generate(owner, property);

        jdbc.update("DELETE FROM food.food_meal_review_analyses WHERE property_id = ?", property);

        assertThat(ratings.analysisStatus(owner, property).current()).isNotNull();
    }

    // ---- Helpers -----------------------------------------------------------

    private static MealReviewAnalysisResponse.Reading reading(MealReviewAnalysisResponse analysis, String name) {
        return analysis.dishes().stream().filter(dish -> dish.name().equals(name)).findFirst().orElseThrow();
    }

    private static SubmitMealRatingRequest.Entry entry(UUID item, Integer rating, String review) {
        return new SubmitMealRatingRequest.Entry(item, rating, review);
    }

    private SubmitMealRatingRequest lunch(SubmitMealRatingRequest.Entry... entries) {
        return new SubmitMealRatingRequest(today, MealType.LUNCH, List.of(entries));
    }

    private void itIs(int hour, int minute) {
        clock.set(today.atTime(hour, minute).atZone(IST).toInstant());
    }

    private UUID tenancyOf(UUID user) {
        return jdbc.queryForObject("SELECT id FROM tenancy.tenancies WHERE user_id = ? AND property_id = ?",
                UUID.class, user, property);
    }

    private void rating(LocalDate date, UUID user, UUID profile, UUID item, int value, String review) {
        jdbc.update("""
                INSERT INTO food.food_meal_ratings (id, property_id, meal_date, meal_type, tenancy_id, user_id,
                    profile_id, item_id, rating, review)
                VALUES (?, ?, ?, 'LUNCH', ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), property, date, tenancyOf(user), user, profile, item, value, review);
    }

    private void attended(UUID user, UUID profile, boolean attended) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_meal_attendance (id, property_id, meal_date, meal_type, tenancy_id,
                    tenant_user_id, profile_id, pass_token, pass_code, attended_at, recorded_by_user_id, record_method)
                VALUES (?, ?, ?, 'LUNCH', ?, ?, ?, ?, ?, CASE WHEN ? THEN now() END, CASE WHEN ? THEN ?::uuid END,
                        CASE WHEN ? THEN 'QR' END)
                """, id, property, today, tenancyOf(user), user, profile, id.toString(),
                String.valueOf(100_000 + ThreadLocalRandom.current().nextInt(900_000)),
                attended, attended, owner.toString(), attended);
    }

    private UUID profile(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_profiles (id, property_id, created_by_user_id, name, display_order, is_active,
                    category, created_at, updated_at, version)
                VALUES (?, ?, ?, ?, 9, true, 'VEG', now(), now(), 0)
                """, id, property, owner, name);
        return id;
    }

    private UUID item(String name, String type) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_items (id, property_id, created_by_user_id, name, quantity_unit, dish_type, is_active,
                    created_at, updated_at, version)
                VALUES (?, ?, ?, ?, 'KILOGRAM', ?, true, now(), now(), 0)
                """, id, property, owner, name, type);
        return id;
    }

    private void menu(UUID profile, UUID item, DayOfWeek day, MealType meal) {
        jdbc.update("""
                INSERT INTO food.food_menu_entries (id, property_id, profile_id, item_id, created_by_user_id, day_of_week,
                    meal_type, base_quantity_per_subscriber, repeat_quantity, expected_repeat_percentage,
                    fixed_buffer_quantity, display_order, is_active, created_at, updated_at, version)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 0, true, now(), now(), 0)
                ON CONFLICT DO NOTHING
                """, UUID.randomUUID(), property, profile, item, owner, day.name(), meal.name());
    }

    private UUID plan(Map<String, Object> stay, UUID profile) {
        UUID id = UUID.randomUUID();
        UUID user = (UUID) stay.get("user_id");
        jdbc.update("""
                INSERT INTO food.food_subscriptions (id, property_id, tenancy_id, tenant_user_id, started_at,
                    effective_from, created_at, updated_at, version)
                VALUES (?, ?, ?, ?, now(), ?, now(), now(), 0)
                """, id, property, stay.get("id"), user, today.minusDays(30));
        for (DayOfWeek day : DayOfWeek.values()) {
            jdbc.update("INSERT INTO food.food_subscription_days (subscription_id, day_of_week, profile_id) VALUES (?, ?, ?)",
                    id, day.name(), profile);
        }
        return user;
    }

    private void grantFood() {
        jdbc.update("""
                INSERT INTO property.manager_permissions (id, property_id, manager_user_id, resource,
                    access_level, granted_by_user_id, granted_at)
                VALUES (?, ?, ?, 'FOOD', 'MANAGE', ?, now())
                """, UUID.randomUUID(), property, manager, owner);
    }

    private UUID manager() {
        UUID id = UUID.randomUUID();
        String phone = "+9195" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, 'Meal Manager', 'USER', true, true, 0, 'MALE', DATE '1990-01-01', now(), now())
                """, id, phone);
        jdbc.update("""
                INSERT INTO property.property_managers (id, property_id, manager_user_id, assigned_by_user_id,
                    is_active, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, ?, now(), now())
                """, UUID.randomUUID(), property, id, owner, "MGR-R-" + id.toString().substring(0, 12));
        return id;
    }
}
