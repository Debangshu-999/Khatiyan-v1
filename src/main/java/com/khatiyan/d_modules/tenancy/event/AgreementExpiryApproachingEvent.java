package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Raised on each reminder milestone in the run-up to an agreement's term ending.
 *
 * <p>{@code daysRemaining} is zero on the final day. Both the tenant and the
 * property's managers are told: the tenant so a term does not lapse without them
 * noticing, the owner so they can plan the bed either way.
 *
 * <p>The reminders are only ever a prompt. <b>An agreement ending is not a
 * tenancy ending</b> — silence means the stay continues, and the tenant becomes
 * an ordinary tenant using the same exit route as everyone else.
 */
public record AgreementExpiryApproachingEvent(
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        LocalDate agreementEndDate,
        int daysRemaining) {
}
