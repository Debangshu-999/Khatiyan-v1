package com.khatiyan.d_modules.dashboard.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * An action center item: a booked stay that can't start because its bed is
 * not free yet. Stays listed until the booking starts.
 */
public record BlockedBookingItem(
    UUID bookingTenancyId,
    String tenantName,
    UUID roomId,
    String roomNumber,
    LocalDate startDate,
    /** PENDING_EXIT, STAY_NOT_ENDED or ROOM_CHANGE_NOT_DONE. */
    String reason,
    /** The stay holding the bed: the one to end, or the one whose room change has not run. */
    UUID blockingTenancyId,
    String blockingTenantName
) {
}
