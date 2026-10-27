package com.khatiyan.d_modules.booking.model;

import java.time.LocalDate;
import java.util.Objects;

/** Inclusive selectable dates for one bed; the tenant may choose any of them. */
public record BookingMoveInWindow(LocalDate earliest, LocalDate latest) {

    public BookingMoveInWindow {
        Objects.requireNonNull(earliest);
        Objects.requireNonNull(latest);
        if (latest.isBefore(earliest)) {
            throw new IllegalArgumentException("A move-in window must contain at least one date");
        }
    }

    public boolean contains(LocalDate date) {
        return date != null && !date.isBefore(earliest) && !date.isAfter(latest);
    }
}
