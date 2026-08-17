package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when the owner decides on a withdrawal request.
 *
 * <p>One event for both outcomes, because the tenant's question is the same
 * either way — am I still leaving? {@code approved} true means the exit is void
 * and the stay continues; false means the exit stands and
 * {@code approvedCheckoutDate} is still the last day.
 */
public record TenancyExitWithdrawalDecidedEvent(
        UUID requestId,
        /** Short code for display. Notifications must never print a UUID. */
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type,
        boolean approved,
        LocalDate approvedCheckoutDate) {
}
