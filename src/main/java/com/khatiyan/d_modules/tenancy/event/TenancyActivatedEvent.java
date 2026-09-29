package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a signed tenancy actually starts. A future booking waits for
 * its start date and the outgoing room change, so signing can precede this.
 *
 * <p>Separate from {@code TenancyStartedEvent}, which fires at CREATION and
 * can take an ordinary free bed. A future booking takes occupancy separately
 * when its approved room change has executed.
 *
 * <p>Nothing occupancy-related listens here. The bed was already taken at
 * creation for ordinary tenancies; the future-booking occupancy event handles
 * the one delayed case.
 */
public record TenancyActivatedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate startDate
) {}
