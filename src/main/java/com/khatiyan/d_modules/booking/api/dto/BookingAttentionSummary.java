package com.khatiyan.d_modules.booking.api.dto;

/** Property work, not unread bookings or steps waiting on the tenant. */
public record BookingAttentionSummary(
        long awaitingResponse, long tokenClaims, long awaitingConfirmation, long moveInsDue,
        // Tokens of guests who did not arrive, waiting on refund or keep (2026-10-28). Refunds owed are not work.
        long tokenDecisions,
        // Confirmed, nobody moved in yet, moving in today: the Home card under Property Leads (user, 2026-10-27).
        long moveInsToday) {
}
