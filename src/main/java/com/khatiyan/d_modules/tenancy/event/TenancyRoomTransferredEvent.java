package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when an active tenancy is moved from one room to another.
 *
 * <p>
 * Listeners typically move room occupancy from the old room to the new room and
 * notify the tenant/management. Billing and deposit identity remains attached
 * to the same tenancy.
 */
public record TenancyRoomTransferredEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID oldRoomId,
    UUID newRoomId,
    LocalDate transferDate,
    long newRentAmountPaise
) {}
