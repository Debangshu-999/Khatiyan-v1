package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a tenancy is CREATED, which is not the same as started.
 *
 * <p>An ordinary pending tenancy takes a currently free bed here. A future
 * room-change booking instead claims its outgoing move without taking physical
 * occupancy; the property listener uses {@code futureBooking} to distinguish it.
 *
 * <p>{@code pendingAcceptance} is the difference between the two moments a
 * tenancy can begin at. A monthly tenancy is created and then WAITS: nothing
 * has started, the tenant has not signed, and billing has not begun. A daily
 * guest stay starts the instant it is created. Telling a tenant "your tenancy
 * has started" while their agreement sits unsigned is simply untrue, so
 * listeners that talk to people branch on this.
 *
 * @param pendingAcceptance true when the tenancy awaits the tenant's signature
 */
public record TenancyStartedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate startDate,
    boolean pendingAcceptance,
    /** A future booking exists, but physical occupancy must wait for the transfer. */
    boolean futureBooking
) {}

