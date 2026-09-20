package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a pending tenancy actually starts, on the tenant's signature.
 *
 * <p>Separate from {@code TenancyStartedEvent}, which fires at CREATION and
 * takes the bed. For a monthly tenancy those are two different days: one when
 * the owner onboards somebody and reserves a bed for them, and one when that
 * person signs and their tenancy — and their billing — begins.
 *
 * <p>Nothing occupancy-related listens here. The bed was already taken at
 * creation, and taking it twice would double-count the room.
 */
public record TenancyActivatedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate startDate
) {}
