package com.khatiyan.d_modules.billing.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a deposit settlement actually pays money out to the tenant
 * (settlement movement with a positive balance). The expense module records it
 * as an AUTO ledger row, idempotent on {@code depositMovementId}. Zero-balance
 * lifecycle settlements do not publish this event.
 */
public record DepositPayoutEvent(
    UUID depositMovementId,
    UUID depositAccountId,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    long amountPaise,
    LocalDate paidOutOn,
    String reason
) {
}
