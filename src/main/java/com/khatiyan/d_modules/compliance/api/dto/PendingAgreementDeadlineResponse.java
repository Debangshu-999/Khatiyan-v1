package com.khatiyan.d_modules.compliance.api.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * When a stay's unsigned agreement expires, for the owner's pending card.
 *
 * @param expiresAt the expiry run that will remove it, not merely the end of
 *                  the acceptance window
 */
public record PendingAgreementDeadlineResponse(UUID tenancyId, Instant expiresAt) {
}
