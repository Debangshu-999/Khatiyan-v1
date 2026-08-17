package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when an exit request lapses because nobody reviewed it in time.
 *
 * <p>Notifies the tenant, whose request went unanswered — they need to know it
 * lapsed and that they may re-raise it without losing notice time. The owner is
 * told too, since letting a request expire is a management failure worth
 * surfacing rather than burying.
 */
public record TenancyExitExpiredEvent(
        UUID requestId,
        /** Short code for display. Notifications must never print a UUID. */
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type) {
}
