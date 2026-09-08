package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

/**
 * Published when a {@code PENDING_ACCEPTANCE} tenancy is cancelled — the tenant
 * declined the agreement, management withdrew the offer, or the acceptance
 * window expired. The bed reserved at creation must be freed; billing never
 * started, so there is nothing to settle.
 *
 * @param route       which of the three it was. The notification copy turns on
 *                    this, so it is carried rather than inferred.
 * @param actorUserId who did it, or null for the expiry, which nobody did.
 *                    Used to keep the notification off the person who just
 *                    performed the action and is looking at the result.
 * @param reason      free text captured at cancellation, may be null or blank.
 */
public record TenancyCancelledEvent(
    UUID tenancyId,
    UUID userId,
    UUID propertyId,
    UUID roomId,
    TenancyCancellationRoute route,
    UUID actorUserId,
    String reason
) {}
