package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a new tenancy becomes active.
 *
 * <p>Listeners typically: send welcome notifications, mark the room
 * as occupied in the property module, kick off the first rent
 * reminder cycle.
 */
public record TenancyStartedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate startDate
) {}

