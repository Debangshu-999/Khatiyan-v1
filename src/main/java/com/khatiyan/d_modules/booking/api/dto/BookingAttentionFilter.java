package com.khatiyan.d_modules.booking.api.dto;

/** Management work queues. Reading or assigning a request does not settle any of these steps. */
public enum BookingAttentionFilter {
    ALL, RESPONSE, TOKEN_CLAIMS, CONFIRMATION, MOVE_IN,
    /** Confirmed and moving in today (user, 2026-10-27). MOVE_IN is the ones past their day. */
    MOVE_IN_TODAY
}
