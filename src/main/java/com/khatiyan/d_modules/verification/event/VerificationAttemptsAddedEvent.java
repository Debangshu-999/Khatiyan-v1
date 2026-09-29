package com.khatiyan.d_modules.verification.event;

import java.util.Map;
import java.util.UUID;

/**
 * The owner gave a pending stay's tenant more verification attempts, so the
 * tenant can try again (owner's decision, 2026-09-27: the tenant is told when
 * this happens).
 *
 * @param attemptsByService attempts added, by service code name
 */
public record VerificationAttemptsAddedEvent(
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        Map<String, Integer> attemptsByService) {
}
