package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotNull;

/**
 * Postpones a notice that has not gone live yet. Only the start is given — the
 * end of the window slides with it, preserving the notice's original duration.
 */
public record DelayNoticeRequest(
    @NotNull(message = "New start time is required")
    Instant visibleFrom
) {
}
