package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

/**
 * The original request's immutable clock snapshot, produced by BookingPolicy.
 * Counters and acceptance reuse this value, never stamp a new request date.
 */
public record BookingTiming(
        Instant submittedAt,
        LocalDate bookingDate,
        LocalDate earliestMoveInDate,
        LocalDate latestMoveInDate,
        Instant expiresAt) {

    public BookingTiming {
        Objects.requireNonNull(submittedAt);
        Objects.requireNonNull(bookingDate);
        Objects.requireNonNull(earliestMoveInDate);
        Objects.requireNonNull(latestMoveInDate);
        Objects.requireNonNull(expiresAt);
        if (latestMoveInDate.isBefore(earliestMoveInDate) || !expiresAt.isAfter(submittedAt)) {
            throw new IllegalArgumentException("Invalid booking timing snapshot");
        }
    }
}
