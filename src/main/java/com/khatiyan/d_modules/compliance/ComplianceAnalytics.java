package com.khatiyan.d_modules.compliance;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The compliance module's answers for owner analytics. Reads the
 * {@code compliance} schema only. It sits in the module's top-level package
 * beside {@link ComplianceModule} because compliance is a closed module: its
 * sub-packages are not visible to other modules.
 *
 * <p>A stay has at most one agreement ({@code UNIQUE (tenancy_id)}).
 */
@Component
public class ComplianceAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public ComplianceAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Each stay's agreement status: DRAFT, PENDING_ACCEPTANCE, ACCEPTED or CANCELLED. */
    public Map<UUID, String> agreementStatusByTenancy(UUID propertyId) {
        Map<UUID, String> statuses = new HashMap<>();
        jdbc.query("SELECT tenancy_id, status FROM compliance.tenancy_agreements WHERE property_id = :propertyId",
                Map.of("propertyId", propertyId),
                rs -> {
                    statuses.put(rs.getObject("tenancy_id", UUID.class), rs.getString("status"));
                });
        return statuses;
    }

    /** Agreements signed in the range (IST), and the median minutes from creation to signing: null when none. */
    public record SigningTimes(int signed, Long medianMinutes) {}

    public SigningTimes signingTimes(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) AS signed,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM accepted_at - created_at) / 60) AS median
                FROM compliance.tenancy_agreements
                WHERE property_id = :propertyId AND status = 'ACCEPTED' AND accepted_at IS NOT NULL
                  AND (accepted_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :from AND :to
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to),
                (rs, i) -> {
                    double median = rs.getDouble("median");
                    return new SigningTimes(rs.getInt("signed"), rs.wasNull() ? null : Math.round(median));
                });
    }
}
