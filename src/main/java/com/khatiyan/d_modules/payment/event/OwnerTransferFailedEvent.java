package com.khatiyan.d_modules.payment.event;

import java.util.UUID;

/**
 * Raised when a payout to an owner's bank could not be completed.
 *
 * <p>The money never left the platform account, so nothing is lost — but the
 * owner is expecting rent that has not arrived, and the usual cause (wrong bank
 * details) will not fix itself on retry. They need telling.
 */
public record OwnerTransferFailedEvent(
        UUID ownerTransferId,
        UUID billingCycleId,
        UUID ownerUserId,
        UUID propertyId,
        long ownerNetPaise,
        String currency,
        String failureReason) {
}
