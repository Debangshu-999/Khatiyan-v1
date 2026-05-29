package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a tenancy is ended.
 *
 * <p>Listeners typically: free the room in the property module,
 * trigger deposit refund flows in the payment module, send exit
 * notifications.
 */
public record TenancyEndedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate endDate
) {}
