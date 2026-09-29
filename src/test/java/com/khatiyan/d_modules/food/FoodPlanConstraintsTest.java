package com.khatiyan.d_modules.food;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.food.analytics.FoodAnalytics;
import com.khatiyan.support.IntegrationTest;

/**
 * The plan rules the database holds (2026-09-29), so two taps at the same
 * moment can never leave a stay with two plans on one day.
 */
@IntegrationTest
class FoodPlanConstraintsTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private FoodAnalytics food;
    @Autowired private com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository plans;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;

    private UUID propertyId;
    private UUID tenancyId;
    private UUID veg;
    private UUID nonVeg;

    @BeforeEach
    void fixture() {
        AnalyticsFixtures fx = new AnalyticsFixtures(jdbc);
        propertyId = fx.property(Instant.now());
        UUID room = fx.room(propertyId, 2, 1, 0, "PARTIALLY_OCCUPIED", true);
        tenancyId = fx.monthlyStay(propertyId, room, "ACTIVE", LocalDate.of(2026, 9, 1), null);
        veg = fx.foodProfile(propertyId, "Veg");
        nonVeg = fx.foodProfile(propertyId, "Non-veg");
    }

    @AfterEach
    void removeFixture() {
        jdbc.update("DELETE FROM food.food_subscriptions WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM food.food_profiles WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM tenancy.tenancies WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM property.rooms WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM property.properties WHERE id = ?", propertyId);
    }

    @Test
    void aStayHasOneOpenPlan() {
        plan(LocalDate.of(2026, 9, 1), null);

        assertThatThrownBy(() -> plan(LocalDate.of(2026, 10, 1), null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void twoPlansNeverShareADay() {
        plan(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 10));

        assertThatThrownBy(() -> plan(LocalDate.of(2026, 9, 9), null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aPlanMayStartTheDayTheLastOneStops() {
        plan(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 10));
        plan(LocalDate.of(2026, 9, 10), null);

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM food.food_subscriptions WHERE tenancy_id = ?", Integer.class, tenancyId))
                .isEqualTo(2);
    }

    @Test
    void aMixedWeekIsOneHybridEntryInMealPreferences() {
        UUID planId = plan(LocalDate.of(2026, 9, 1), null);
        jdbc.update("UPDATE food.food_subscription_days SET profile_id = ? WHERE subscription_id = ? AND day_of_week = 'TUESDAY'",
                veg, planId);

        assertThat(food.activeSubscriptions(propertyId))
                .containsExactly(new FoodAnalytics.ActiveSubscription(tenancyId, null, FoodAnalytics.HYBRID));
    }

    /**
     * A plan loaded from the database with one profile all week is not hybrid
     * (2026-09-29): a Non-veg tenant was shown as Hybrid, because Hibernate's
     * map values stream as already distinct and distinct() skipped the work.
     */
    @Test
    void aOneProfileWeekLoadedFromTheDatabaseIsNotHybrid() {
        UUID planId = plan(LocalDate.of(2026, 9, 1), null);

        Boolean hybrid = new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                .execute(status -> plans.findById(planId).orElseThrow().isHybrid());

        assertThat(hybrid).isFalse();
    }

    /** Non-veg all week, from {@code from} until {@code until} (open when null). */
    private UUID plan(LocalDate from, LocalDate until) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_subscriptions (id, property_id, tenancy_id, tenant_user_id,
                    started_at, effective_from, effective_until, created_at, updated_at)
                VALUES (?, ?, ?, ?, now(), ?, ?, now(), now())
                """, id, propertyId, tenancyId, UUID.randomUUID(), from, until);
        jdbc.update("""
                INSERT INTO food.food_subscription_days (subscription_id, day_of_week, profile_id)
                SELECT ?, d, ? FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) AS d
                """, id, nonVeg);
        return id;
    }
}
