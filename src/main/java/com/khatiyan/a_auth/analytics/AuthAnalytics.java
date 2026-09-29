package com.khatiyan.a_auth.analytics;

import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The auth module's answers for owner analytics. Reads the {@code auth} schema
 * only, and returns COUNTS, never rows: an owner may see how their tenants split
 * by gender and age, not whose date of birth is what.
 */
@Component
public class AuthAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public AuthAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Keys are codes. Gender: {@code MALE}, {@code FEMALE}, {@code TRANSGENDER},
     * {@code OTHER}, {@code NOT_GIVEN}. Age (the owner's groups, 2026-09-26):
     * {@code UNDER_18}, {@code 18_24}, {@code 25_34}, {@code 35_44},
     * {@code 45_PLUS}, {@code NOT_GIVEN}. "Prefer not to say" (UNDECLARED) counts as not given.
     * A band nobody is in is simply absent.
     */
    public record ProfileCounts(Map<String, Integer> gender, Map<String, Integer> ageBands) {}

    public ProfileCounts profileCounts(Collection<UUID> userIds, LocalDate today) {
        Map<String, Integer> gender = new LinkedHashMap<>();
        Map<String, Integer> ages = new LinkedHashMap<>();
        if (userIds.isEmpty()) {
            return new ProfileCounts(gender, ages);
        }
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("ids", userIds).addValue("today", today);
        jdbc.query("""
                SELECT CASE WHEN gender IS NULL OR gender = 'UNDECLARED' THEN 'NOT_GIVEN' ELSE gender END AS band,
                       COUNT(*) AS n
                FROM auth.users WHERE id IN (:ids)
                GROUP BY 1
                """, params, rs -> {
            gender.put(rs.getString("band"), rs.getInt("n"));
        });
        jdbc.query("""
                SELECT CASE
                           WHEN date_of_birth IS NULL THEN 'NOT_GIVEN'
                           WHEN age(CAST(:today AS date), date_of_birth) < INTERVAL '18 years' THEN 'UNDER_18'
                           WHEN age(CAST(:today AS date), date_of_birth) < INTERVAL '25 years' THEN '18_24'
                           WHEN age(CAST(:today AS date), date_of_birth) < INTERVAL '35 years' THEN '25_34'
                           WHEN age(CAST(:today AS date), date_of_birth) < INTERVAL '45 years' THEN '35_44'
                           ELSE '45_PLUS'
                       END AS band,
                       COUNT(*) AS n
                FROM auth.users WHERE id IN (:ids)
                GROUP BY 1
                """, params, rs -> {
            ages.put(rs.getString("band"), rs.getInt("n"));
        });
        return new ProfileCounts(gender, ages);
    }
}
