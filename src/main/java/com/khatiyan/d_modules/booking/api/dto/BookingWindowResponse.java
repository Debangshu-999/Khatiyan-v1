package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.khatiyan.d_modules.booking.model.BookingMoveInWindow;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.service.BookingPolicy;

/** Server-derived dates for a future room-picker contract; no endpoint exposes this yet. */
public record BookingWindowResponse(
        LocalDate bookingDate,
        LocalDate earliestMoveInDate,
        LocalDate latestMoveInDate,
        Instant requestExpiresAt,
        int minimumAdvanceDays,
        int maximumAdvanceDays,
        int postVisitDays) {

    public static BookingWindowResponse of(BookingTiming timing, BookingMoveInWindow selectable) {
        if (selectable.earliest().isBefore(timing.earliestMoveInDate())
                || selectable.latest().isAfter(timing.latestMoveInDate())) {
            throw new IllegalArgumentException("A bed's selectable dates must stay inside the request window");
        }
        // The owner's limit as this request sees it, not the default.
        int maximumAdvanceDays = (int) ChronoUnit.DAYS.between(timing.bookingDate(), timing.latestMoveInDate());
        return new BookingWindowResponse(timing.bookingDate(), selectable.earliest(), selectable.latest(),
                timing.expiresAt(), BookingPolicy.MINIMUM_MOVE_IN_DAYS,
                maximumAdvanceDays, BookingPolicy.POST_VISIT_DAYS);
    }
}
