package com.khatiyan.d_modules.verification.analytics;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The verification module's answers for owner analytics. Reads the
 * {@code verification} schema only.
 */
@Component
public class VerificationAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public VerificationAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Stays whose tenant passed an e-KYC check at this property. */
    public Set<UUID> verifiedTenancyIds(UUID propertyId) {
        return new HashSet<>(jdbc.query("""
                SELECT DISTINCT tenancy_id FROM verification.verification_grants
                WHERE property_id = :propertyId AND status = 'VERIFIED'
                """, Map.of("propertyId", propertyId), (rs, i) -> rs.getObject("tenancy_id", UUID.class)));
    }
}
