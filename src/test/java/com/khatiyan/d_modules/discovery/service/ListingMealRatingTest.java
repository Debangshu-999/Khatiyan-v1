package com.khatiyan.d_modules.discovery.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyDiscoveryProfileRequest;
import com.khatiyan.support.IntegrationTest;

/**
 * The owner always sees the current meal rating, and the public profile only once the
 * owner has turned it on (user, 2026-11-03).
 */
@IntegrationTest
class ListingMealRatingTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PropertyDiscoveryService discovery;

    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    private Seeded seeded;
    private UUID property;
    private UUID owner;

    @BeforeEach
    void seed() {
        seeded = LargePropertySeeder.seed(jdbc, today, 8, 1, 75L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        jdbc.update("UPDATE property.properties SET food_included = true WHERE id = ?", property);
        jdbc.update("""
                INSERT INTO food.food_module_settings (property_id, is_enabled, created_at, updated_at, version)
                VALUES (?, true, now(), now(), 0)
                """, property);
        jdbc.update("""
                INSERT INTO discovery.property_discovery_profiles (id, property_id, headline, description, public_visible,
                    is_active, created_at, updated_at)
                VALUES (?, ?, 'A headline', 'A description', true, true, now(), now())
                """, UUID.randomUUID(), property);
    }

    @AfterEach
    void remove() {
        jdbc.update("DELETE FROM food.food_meal_ratings WHERE property_id = ?", property);
        jdbc.update("DELETE FROM discovery.property_discovery_profiles WHERE property_id = ?", property);
        jdbc.update("DELETE FROM food.food_module_settings WHERE property_id = ?", property);
        LargePropertySeeder.remove(jdbc, seeded);
    }

    @Test
    void theOwnerSeesTheRatingAndThePublicOnlyOnceItIsTurnedOn() {
        rate(today, 5);
        rate(today.minusDays(1), 4);

        assertThat(discovery.getManagedProfile(owner, property).showMealRating()).isFalse();
        assertThat(discovery.getManagedProfile(owner, property).mealRating()).isEqualTo(4.5);
        assertThat(discovery.getVisibleProperty(property, null, null).mealRating()).isNull();

        assertThat(turn(true).showMealRating()).isTrue();
        assertThat(discovery.getVisibleProperty(property, null, null).mealRating()).isEqualTo(4.5);

        assertThat(turn(false).showMealRating()).isFalse();
        assertThat(discovery.getVisibleProperty(property, null, null).mealRating()).isNull();
    }

    @Test
    void anEditThatDoesNotMentionItLeavesItOn() {
        turn(true);

        discovery.updateManagedProfile(owner, property,
                new UpdatePropertyDiscoveryProfileRequest("New headline", "A description", null, null, null, null));

        assertThat(discovery.getManagedProfile(owner, property).showMealRating()).isTrue();
    }

    @Test
    void ratingsOlderThanThirtyDaysDoNotCount() {
        rate(today.minusDays(30), 1);
        rate(today.minusDays(29), 3);

        assertThat(discovery.getManagedProfile(owner, property).mealRating()).isEqualTo(3.0);
    }

    @Test
    void theOwnerCanPreviewAListingNobodyElseCanYetSee() {
        jdbc.update("UPDATE discovery.property_discovery_profiles SET public_visible = false WHERE property_id = ?", property);

        assertThatThrownBy(() -> discovery.getVisibleProperty(property, null, null)).isInstanceOf(NotFoundException.class);
        assertThat(discovery.previewManagedProperty(owner, property).headline()).isEqualTo("A headline");
    }

    @Test
    void aStrangerCannotPreviewIt() {
        assertThatThrownBy(() -> discovery.previewManagedProperty(UUID.randomUUID(), property)).isInstanceOf(RuntimeException.class);
    }

    @Test
    void aPreviewShowsTheRatingOnlyWhenThePublicWouldSeeIt() {
        rate(today, 5);
        assertThat(discovery.previewManagedProperty(owner, property).mealRating()).isNull();

        turn(true);
        assertThat(discovery.previewManagedProperty(owner, property).mealRating()).isEqualTo(5.0);
    }

    @Test
    void aPropertyNotServingFoodShowsNothingPublicly() {
        rate(today, 5);
        turn(true);
        jdbc.update("UPDATE property.properties SET food_included = false WHERE id = ?", property);

        assertThat(discovery.getVisibleProperty(property, null, null).mealRating()).isNull();
    }

    private com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryProfileResponse turn(boolean on) {
        return discovery.updateManagedProfile(owner, property,
                new UpdatePropertyDiscoveryProfileRequest("A headline", "A description", null, null, null, on));
    }

    private void rate(LocalDate date, int rating) {
        jdbc.update("""
                INSERT INTO food.food_meal_ratings (id, property_id, meal_date, meal_type, tenancy_id, user_id,
                    profile_id, item_id, rating)
                VALUES (?, ?, ?, 'LUNCH', ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), property, Date.valueOf(date), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), rating);
    }
}
