package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A booked stay cannot start: the bed it was promised is not free yet.
 *
 * <p>Published once per booking, the first time it is found late or its room
 * change fails. Management is told, and the action center lists the booking
 * until it starts. Nothing is cancelled: the booking keeps waiting and starts
 * the moment its bed frees.
 */
public record FutureBookingBlockedEvent(
    UUID bookingTenancyId,
    UUID propertyId,
    UUID roomId,
    LocalDate startDate,
    Reason reason,
    /** The stay holding the bed: the one to end, or the one whose room change has not run. */
    UUID blockingTenancyId
) {

    public enum Reason {
        /** The stay in the bed is past its checkout date and nobody has ended it. */
        PENDING_EXIT,
        /** The stay in the bed is due to end and has not been ended yet. */
        STAY_NOT_ENDED,
        /** The room change that frees the bed has not run, or failed and is being retried. */
        ROOM_CHANGE_NOT_DONE
    }
}
