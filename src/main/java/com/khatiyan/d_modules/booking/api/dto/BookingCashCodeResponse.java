package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;

/**
 * A cash code went to the tenant for a booking token.
 *
 * @param sentTo the number it went to, masked to its last four digits
 */
public record BookingCashCodeResponse(String sentTo, long amountPaise, Instant expiresAt) {
}
