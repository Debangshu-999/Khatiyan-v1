package com.khatiyan.d_modules.food.analytics;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The food module's answers for owner analytics. Reads the {@code food} schema
 * only. Whether food is on for a property is {@code FoodModule}'s question.
 */
@Component
public class FoodAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public FoodAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * A plan that applies today and the profile it eats, by the name the owner
     * gave that profile. A hybrid week (2026-09-29) is one row with no profile,
     * named "Hybrid".
     */
    public record ActiveSubscription(UUID tenancyId, UUID profileId, String profileName) {}

    public static final String HYBRID = "Hybrid";

    public List<ActiveSubscription> activeSubscriptions(UUID propertyId) {
        List<ActiveSubscription> perProfile = jdbc.query("""
                SELECT s.tenancy_id, d.profile_id, p.name
                FROM food.food_subscriptions s
                JOIN food.food_subscription_days d ON d.subscription_id = s.id
                JOIN food.food_profiles p ON p.id = d.profile_id
                WHERE s.property_id = :propertyId
                  AND s.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
                  AND (s.effective_until IS NULL OR s.effective_until > (now() AT TIME ZONE 'Asia/Kolkata')::date)
                GROUP BY s.tenancy_id, d.profile_id, p.name
                ORDER BY s.tenancy_id
                """, Map.of("propertyId", propertyId), (rs, i) -> new ActiveSubscription(
                rs.getObject("tenancy_id", UUID.class), rs.getObject("profile_id", UUID.class), rs.getString("name")));
        Map<UUID, List<ActiveSubscription>> byTenancy = perProfile.stream()
                .collect(Collectors.groupingBy(ActiveSubscription::tenancyId, LinkedHashMap::new, Collectors.toList()));
        return byTenancy.values().stream()
                .map(rows -> rows.size() == 1 ? rows.get(0) : new ActiveSubscription(rows.get(0).tenancyId(), null, HYBRID))
                .toList();
    }

    public record DaySubscriptions(LocalDate day, int started, int ended) {}

    /**
     * Plans started, and ended, on each IST day of the range, by the day they
     * took effect (2026-09-29). A change set for tomorrow counts from tomorrow.
     */
    public List<DaySubscriptions> subscriptionMoves(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT day, SUM(started) AS started, SUM(ended) AS ended FROM (
                    SELECT effective_from AS day, 1 AS started, 0 AS ended
                    FROM food.food_subscriptions
                    WHERE property_id = :propertyId
                      AND effective_from BETWEEN :from AND :to
                      AND effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
                    UNION ALL
                    SELECT effective_until, 0, 1
                    FROM food.food_subscriptions
                    WHERE property_id = :propertyId AND effective_until IS NOT NULL
                      AND effective_until BETWEEN :from AND :to
                      AND effective_until <= (now() AT TIME ZONE 'Asia/Kolkata')::date
                ) moves
                GROUP BY day
                ORDER BY day
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to),
                (rs, i) -> new DaySubscriptions(rs.getObject("day", LocalDate.class), rs.getInt("started"), rs.getInt("ended")));
    }
}
