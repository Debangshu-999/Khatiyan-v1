package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when a tenant asks to undo an already-approved exit.
 *
 * <p>Goes to the owner, who has to decide. The approved checkout date rides
 * along because it is the thing at stake: they may already have promised the bed
 * from that date.
 */
public record TenancyExitWithdrawalRequestedEvent(
        UUID requestId,
        /** Short code for display. Notifications must never print a UUID. */
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type,
        LocalDate approvedCheckoutDate) {
}
