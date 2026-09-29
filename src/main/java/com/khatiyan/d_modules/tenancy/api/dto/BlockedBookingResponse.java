package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.event.FutureBookingBlockedEvent;

/**
 * A booked stay that cannot start yet because its bed is not free. Shown on
 * the owner's action center until it starts.
 */
public record BlockedBookingResponse(
    UUID bookingTenancyId,
    String tenantName,
    UUID roomId,
    LocalDate startDate,
    FutureBookingBlockedEvent.Reason reason,
    /** The stay holding the bed: end it, or see to its room change. */
    UUID blockingTenancyId,
    String blockingTenantName
) {
}
