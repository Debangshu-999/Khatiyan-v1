package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
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
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.support.IntegrationTest;

/**
 * Meal attendance, end to end (user, 2026-11-01): the switch, the tenant's pass,
 * scanning it, and the day's report and history.
 *
 * <p>The property serves lunch (12:30 to 2:30) and dinner (8 to 10) on the
 * default timetable. Two tenants are on a plan with dishes at both, one on a
 * plan with dishes at dinner only, and one has no plan. The clock is the test's
 * own, so each rule is checked at its time of day whenever the build runs. Its
 * date is always the real one.
 */
@IntegrationTest
@Import(MealAttendanceIntegrationTest.ClockOverride.class)
class MealAttendanceIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private MealAttendanceService attendance;
    @Autowired private SettableClock clock;

    private final LocalDate today = LocalDate.now(IST);

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID manager;
    private UUID eatsBoth;
    private UUID alsoEatsBoth;
    private UUID eatsDinnerOnly;
    private UUID noPlan;

    static class SettableClock extends Clock {
        private volatile Instant fixed;

        void set(Instant instant) {
            this.fixed = instant;
        }

        @Override
        public ZoneId getZone() {
            return IST;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            Instant set = fixed;
            return set != null ? set : Instant.now();
        }
    }

    @TestConfiguration
    static class ClockOverride {
        @Bean
        @Primary
        SettableClock settableClock() {
            return new SettableClock();
        }
    }

    @BeforeEach
    void seed() {
        itIs(9, 0);
        seeded = LargePropertySeeder.seed(jdbc, today, 8, 1, 73L);
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

        UUID both = profile("Daily veg");
        UUID dinnerOnly = profile("Light");
        UUID item = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_items (id, property_id, created_by_user_id, name, quantity_unit, is_active,
                    created_at, updated_at, version)
                VALUES (?, ?, ?, 'Rice', 'KG', true, now(), now(), 0)
                """, item, property, owner);
        menu(both, item, MealType.LUNCH);
        menu(both, item, MealType.DINNER);
        menu(dinnerOnly, item, MealType.DINNER);

        List<Map<String, Object>> stays = jdbc.queryForList(
                "SELECT id, user_id FROM tenancy.tenancies WHERE property_id = ? AND is_active ORDER BY reference_code",
                property);
        assertThat(stays).hasSizeGreaterThanOrEqualTo(4);
        eatsBoth = plan(stays.get(0), both);
        alsoEatsBoth = plan(stays.get(1), both);
        eatsDinnerOnly = plan(stays.get(2), dinnerOnly);
        noPlan = (UUID) stays.get(3).get("user_id");

        attendance.setEnabled(owner, property, true);
    }

    @AfterEach
    void remove() {
        clock.set(null);
        jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
        jdbc.update("DELETE FROM auth.users WHERE id = ?", manager);
        LargePropertySeeder.remove(jdbc, seeded);
    }

    // ---- The pass -------------------------------------------------------------

    @Test
    void beforeTheMealThePassIsPromisedButHasNoCode() {
        itIs(11, 0);

        MealPassResponse pass = attendance.myPass(eatsBoth);

        assertThat(pass.state()).isEqualTo(MealPassState.UPCOMING);
        assertThat(pass.mealType()).isEqualTo(MealType.LUNCH);
        assertThat(pass.startTime()).isEqualTo(LocalTime.of(12, 30));
        assertThat(pass.token()).isNull();
        assertThat(pass.code()).isNull();
    }

    @Test
    void whenTheMealStartsThePassHasAQrAndASixDigitCode() {
        itIs(12, 30);

        MealPassResponse pass = attendance.myPass(eatsBoth);

        assertThat(pass.state()).isEqualTo(MealPassState.OPEN);
        assertThat(pass.mealType()).isEqualTo(MealType.LUNCH);
        assertThat(pass.token()).isNotBlank();
        assertThat(pass.code()).matches("\\d{6}");
        assertThat(pass.profileName()).isEqualTo("Daily veg");
        // The same pass every time it is opened.
        assertThat(attendance.myPass(eatsBoth).token()).isEqualTo(pass.token());
    }

    @Test
    void aPassIsOnlyForATenantSubscribedToThatMeal() {
        itIs(12, 40);

        MealPassResponse notThisMeal = attendance.myPass(eatsDinnerOnly);
        assertThat(notThisMeal.state()).isEqualTo(MealPassState.UPCOMING);
        assertThat(notThisMeal.mealType()).isEqualTo(MealType.DINNER);

        assertThat(attendance.myPass(noPlan)).isNull();
    }

    @Test
    void noPassesWhileTheSwitchIsOff() {
        attendance.setEnabled(owner, property, false);
        itIs(12, 40);

        assertThat(attendance.myPass(eatsBoth)).isNull();
        assertThat(attendance.live(owner, property).enabled()).isFalse();
    }

    @Test
    void aDelayedMealMovesItsPass() {
        jdbc.update("""
                INSERT INTO food.food_meal_delays (id, property_id, meal_date, meal_type, delay_minutes,
                    delayed_by_user_id, created_at, updated_at, version)
                VALUES (?, ?, ?, 'LUNCH', 60, ?, now(), now(), 0)
                """, UUID.randomUUID(), property, today, owner);
        itIs(12, 40);

        MealPassResponse pass = attendance.myPass(eatsBoth);

        assertThat(pass.state()).isEqualTo(MealPassState.UPCOMING);
        assertThat(pass.startTime()).isEqualTo(LocalTime.of(13, 30));
    }

    @Test
    void turningItOnPartWayThroughAMealStartsFromTheNextOne() {
        attendance.setEnabled(owner, property, false);
        itIs(12, 40);
        attendance.setEnabled(owner, property, true);

        MealPassResponse pass = attendance.myPass(eatsBoth);
        assertThat(pass.state()).isEqualTo(MealPassState.UPCOMING);
        assertThat(pass.mealType()).isEqualTo(MealType.DINNER);
        assertThat(attendance.live(owner, property).openMeal()).isNull();

        itIs(20, 0);
        assertThat(attendance.myPass(eatsBoth).state()).isEqualTo(MealPassState.OPEN);
    }

    @Test
    void anOffAndOnAgainDuringAMealKeepsThatMealGoing() {
        itIs(12, 40);
        String token = attendance.myPass(eatsBoth).token();
        attendance.setEnabled(owner, property, false);
        itIs(12, 45);
        attendance.setEnabled(owner, property, true);

        assertThat(attendance.myPass(eatsBoth).token()).isEqualTo(token);
        assertThat(attendance.live(owner, property).openMeal().mealType()).isEqualTo(MealType.LUNCH);
    }

    // ---- Scanning -------------------------------------------------------------

    @Test
    void scanningRecordsTheTenantAndCountsThem() {
        itIs(12, 40);
        String token = attendance.myPass(eatsBoth).token();

        MealScanResponse scan = attendance.scan(owner, property, new MealScanRequest(token, null));

        assertThat(scan.alreadyRecorded()).isFalse();
        assertThat(scan.mealType()).isEqualTo(MealType.LUNCH);
        assertThat(scan.tenantName()).isNotBlank();
        assertThat(scan.profileName()).isEqualTo("Daily veg");
        assertThat(scan.attended()).isEqualTo(1);
        // Both lunch eaters, not the one on a dinner-only plan.
        assertThat(scan.expected()).isEqualTo(2);

        assertThat(attendance.myPass(eatsBoth).state()).isEqualTo(MealPassState.RECORDED);
    }

    @Test
    void aSecondScanSaysAlreadyRecordedAndCountsOnce() {
        itIs(12, 40);
        String token = attendance.myPass(eatsBoth).token();
        Instant first = attendance.scan(owner, property, new MealScanRequest(token, null)).attendedAt();

        itIs(12, 50);
        MealScanResponse again = attendance.scan(manager, property, new MealScanRequest(token, null));

        assertThat(again.alreadyRecorded()).isTrue();
        assertThat(again.attendedAt()).isEqualTo(first);
        assertThat(again.attended()).isEqualTo(1);
    }

    @Test
    void theCodeWorksInPlaceOfTheQr() {
        itIs(12, 40);
        String code = attendance.myPass(alsoEatsBoth).code();

        assertThat(attendance.scan(owner, property, new MealScanRequest(null, code)).alreadyRecorded()).isFalse();
    }

    @Test
    void aWrongCodeIsRefused() {
        itIs(12, 40);
        String code = attendance.myPass(eatsBoth).code();
        String wrong = code.equals("111111") ? "222222" : "111111";

        assertThatThrownBy(() -> attendance.scan(owner, property, new MealScanRequest(null, wrong)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not match");
    }

    @Test
    void anyManagerMayScanWithoutTheFoodPermission() {
        itIs(12, 40);
        String token = attendance.myPass(eatsBoth).token();

        assertThat(attendance.live(manager, property).openMeal().mealType()).isEqualTo(MealType.LUNCH);
        assertThat(attendance.scan(manager, property, new MealScanRequest(token, null)).attended()).isEqualTo(1);
    }

    @Test
    void someoneNotManagingThePropertyMayNotScan() {
        itIs(12, 40);
        String token = attendance.myPass(eatsBoth).token();

        assertThatThrownBy(() -> attendance.scan(eatsBoth, property, new MealScanRequest(token, null)))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void aPassFromAnotherPropertyIsRefused() {
        jdbc.update("""
                INSERT INTO food.food_meal_attendance (id, property_id, meal_date, meal_type, tenancy_id,
                    tenant_user_id, profile_id, pass_token, pass_code)
                VALUES (?, ?, ?, 'LUNCH', ?, ?, ?, 'someone-elses-token', '123456')
                """, UUID.randomUUID(), UUID.randomUUID(), today, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        itIs(12, 40);
        try {
            assertThatThrownBy(() -> attendance.scan(owner, property, new MealScanRequest("someone-elses-token", null)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("not a meal pass for this property");
        } finally {
            jdbc.update("DELETE FROM food.food_meal_attendance WHERE pass_token = 'someone-elses-token'");
        }
    }

    @Test
    void someoneStillInLineTenMinutesAfterTheEndIsCounted() {
        itIs(14, 0);
        String token = attendance.myPass(eatsBoth).token();

        itIs(14, 39);
        assertThat(attendance.scan(owner, property, new MealScanRequest(token, null)).alreadyRecorded()).isFalse();
    }

    @Test
    void afterTheTenMinutesThePassNoLongerWorks() {
        itIs(14, 0);
        String token = attendance.myPass(eatsBoth).token();

        itIs(14, 40);
        assertThatThrownBy(() -> attendance.scan(owner, property, new MealScanRequest(token, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Lunch");
        assertThat(attendance.live(owner, property).openMeal()).isNull();
        assertThat(attendance.myPass(eatsBoth).mealType()).isEqualTo(MealType.DINNER);
    }

    @Test
    void theLiveCardNamesTheMealAndItsCount() {
        itIs(12, 40);

        MealAttendanceLiveResponse live = attendance.live(manager, property);

        assertThat(live.enabled()).isTrue();
        assertThat(live.openMeal().mealType()).isEqualTo(MealType.LUNCH);
        assertThat(live.openMeal().attended()).isZero();
        assertThat(live.openMeal().expected()).isEqualTo(2);
    }

    // ---- The report -----------------------------------------------------------

    @Test
    void theDayReportCountsAttendedAndSkippedOnceTheMealIsOver() {
        itIs(12, 40);
        attendance.scan(owner, property, new MealScanRequest(attendance.myPass(eatsBoth).token(), null));
        attendance.myPass(alsoEatsBoth);

        MealAttendanceDayResponse.Meal during = lunch(attendance.day(owner, property, today));
        assertThat(during.state()).isEqualTo(MealAttendanceState.OPEN);
        assertThat(during.attended()).isEqualTo(1);
        assertThat(during.skipped()).isZero();

        itIs(15, 0);
        MealAttendanceDayResponse.Meal after = lunch(attendance.day(owner, property, today));
        assertThat(after.state()).isEqualTo(MealAttendanceState.DONE);
        assertThat(after.recorded()).isTrue();
        assertThat(after.attended()).isEqualTo(1);
        assertThat(after.expected()).isEqualTo(2);
        assertThat(after.skipped()).isEqualTo(1);
    }

    @Test
    void aMealWithNoScansIsNotRecordedRatherThanEveryoneSkipping() {
        itIs(12, 40);
        attendance.myPass(eatsBoth);

        itIs(15, 0);
        MealAttendanceDayResponse.Meal meal = lunch(attendance.day(owner, property, today));

        assertThat(meal.recorded()).isFalse();
        assertThat(meal.skipped()).isZero();
        assertThat(attendance.meal(owner, property, today, MealType.LUNCH).notAttended()).isEmpty();
    }

    @Test
    void theMealReportNamesWhoAteAndWhoSkipped() {
        itIs(12, 40);
        attendance.scan(owner, property, new MealScanRequest(attendance.myPass(eatsBoth).token(), null));
        attendance.myPass(alsoEatsBoth);

        itIs(15, 0);
        MealAttendanceMealResponse meal = attendance.meal(owner, property, today, MealType.LUNCH);

        assertThat(meal.attended()).hasSize(1);
        assertThat(meal.attended().get(0).attendedAt()).isNotNull();
        assertThat(meal.attended().get(0).profileName()).isEqualTo("Daily veg");
        assertThat(meal.notAttended()).hasSize(1);
        assertThat(meal.notAttended().get(0).attendedAt()).isNull();
    }

    @Test
    void theReportIsForThoseWhoCanViewFood() {
        assertThatThrownBy(() -> attendance.day(manager, property, today))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void aFutureDayHasNoReport() {
        assertThatThrownBy(() -> attendance.day(owner, property, today.plusDays(1)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void historyListsEveryDayBackToTheFirstRecordedOne() {
        LocalDate twoDaysAgo = today.minusDays(2);
        row(twoDaysAgo, MealType.LUNCH, eatsBoth, true);
        row(twoDaysAgo, MealType.LUNCH, alsoEatsBoth, false);
        // Yesterday's dinner had passes opened and nobody scanned: not recorded.
        row(today.minusDays(1), MealType.DINNER, eatsBoth, false);
        itIs(9, 0);

        MealAttendanceHistoryResponse history = attendance.history(owner, property, 0, 14);

        assertThat(history.days()).extracting(MealAttendanceHistoryResponse.Day::date)
                .containsExactly(today, today.minusDays(1), twoDaysAgo);
        assertThat(history.hasMore()).isFalse();

        MealAttendanceDayResponse.Meal lunch = history.days().get(2).meals().stream()
                .filter(meal -> meal.mealType() == MealType.LUNCH).findFirst().orElseThrow();
        assertThat(lunch.attended()).isEqualTo(1);
        assertThat(lunch.expected()).isEqualTo(2);
        assertThat(lunch.skipped()).isEqualTo(1);

        MealAttendanceDayResponse.Meal dinner = history.days().get(1).meals().stream()
                .filter(meal -> meal.mealType() == MealType.DINNER).findFirst().orElseThrow();
        assertThat(dinner.recorded()).isFalse();
    }

    @Test
    void analyticsCountRecordedMealsPerPlanAndLeaveOutAMealStillToCome() {
        // Recorded: one of two ate.
        row(today.minusDays(2), MealType.LUNCH, eatsBoth, true);
        row(today.minusDays(2), MealType.LUNCH, alsoEatsBoth, false);
        // Passes opened and nobody scanned: not recorded, so not a meal everyone skipped.
        row(today.minusDays(1), MealType.DINNER, eatsBoth, false);
        // Today's lunch has not come yet at nine, whatever its rows say.
        row(today, MealType.LUNCH, eatsBoth, true);
        itIs(9, 0);

        MealAttendanceAnalyticsResponse analytics = attendance.analytics(owner, property);

        assertThat(analytics.plans()).singleElement().satisfies(plan -> {
            assertThat(plan.name()).isEqualTo("Daily veg");
            assertThat(plan.meals()).singleElement().satisfies(meal -> {
                assertThat(meal.mealType()).isEqualTo(MealType.LUNCH);
                assertThat(meal.thisMonth().stream().mapToLong(MealAttendanceAnalyticsResponse.Cell::attended).sum()).isEqualTo(1);
                assertThat(meal.thisMonth().stream().mapToLong(MealAttendanceAnalyticsResponse.Cell::expected).sum()).isEqualTo(2);
            });
        });
        assertThat(analytics.weekColumns()).hasSize(7).contains(today);
        assertThat(analytics.yearColumns()).last().isEqualTo(today.withDayOfMonth(1));
        assertThat(analytics.monthColumns()).last().isEqualTo(today.with(java.time.DayOfWeek.MONDAY));
    }

    @Test
    void onlyTodaysMealsCarryTheirTimes() {
        row(today.minusDays(1), MealType.LUNCH, eatsBoth, true);
        itIs(9, 0);

        assertThat(lunch(attendance.day(owner, property, today)).time()).contains(" to ");
        assertThat(lunch(attendance.day(owner, property, today.minusDays(1))).time()).isNull();
    }

    @Test
    void analyticsAreForThoseWhoCanViewTheReports() {
        assertThatThrownBy(() -> attendance.analytics(noPlan, property)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    void historyPagesBackThroughTheCalendar() {
        row(today.minusDays(3), MealType.LUNCH, eatsBoth, true);

        MealAttendanceHistoryResponse first = attendance.history(owner, property, 0, 2);
        assertThat(first.days()).extracting(MealAttendanceHistoryResponse.Day::date)
                .containsExactly(today, today.minusDays(1));
        assertThat(first.hasMore()).isTrue();

        MealAttendanceHistoryResponse second = attendance.history(owner, property, 1, 2);
        assertThat(second.days()).extracting(MealAttendanceHistoryResponse.Day::date)
                .containsExactly(today.minusDays(2), today.minusDays(3));
        assertThat(second.hasMore()).isFalse();
    }

    private MealAttendanceDayResponse.Meal lunch(MealAttendanceDayResponse day) {
        return day.meals().stream().filter(meal -> meal.mealType() == MealType.LUNCH).findFirst().orElseThrow();
    }

    private void itIs(int hour, int minute) {
        clock.set(today.atTime(hour, minute).atZone(IST).toInstant());
    }

    private void row(LocalDate date, MealType meal, UUID tenant, boolean attended) {
        UUID id = UUID.randomUUID();
        UUID tenancy = jdbc.queryForObject(
                "SELECT id FROM tenancy.tenancies WHERE user_id = ? AND property_id = ?", UUID.class, tenant, property);
        UUID profile = jdbc.queryForObject(
                "SELECT id FROM food.food_profiles WHERE property_id = ? AND name = 'Daily veg' LIMIT 1", UUID.class, property);
        jdbc.update("""
                INSERT INTO food.food_meal_attendance (id, property_id, meal_date, meal_type, tenancy_id,
                    tenant_user_id, profile_id, pass_token, pass_code, attended_at, recorded_by_user_id, record_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN now() END, CASE WHEN ? THEN ?::uuid END,
                        CASE WHEN ? THEN 'QR' END)
                """, id, property, date, meal.name(), tenancy, tenant, profile, id.toString(),
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

    private void menu(UUID profile, UUID item, MealType meal) {
        jdbc.update("""
                INSERT INTO food.food_menu_entries (id, property_id, profile_id, item_id, created_by_user_id, day_of_week,
                    meal_type, base_quantity_per_subscriber, repeat_quantity, expected_repeat_percentage,
                    fixed_buffer_quantity, display_order, is_active, created_at, updated_at, version)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 0, true, now(), now(), 0)
                """, UUID.randomUUID(), property, profile, item, owner, today.getDayOfWeek().name(), meal.name());
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

    /** A manager with no resource granted, so not the Food permission. */
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
                """, UUID.randomUUID(), property, id, owner, "MGR-M-" + id.toString().substring(0, 12));
        return id;
    }
}
