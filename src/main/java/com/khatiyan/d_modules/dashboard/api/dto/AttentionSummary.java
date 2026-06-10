package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * "What needs attention" rollup for a single property — the actionable queue.
 * {@code upcomingExits} counts approved exits whose checkout falls within the
 * configured upcoming-exit window.
 */
public record AttentionSummary(
    long paymentsOverdue,
    long concernsUnattended24h,
    long escalatedConcerns,
    long pendingExitRequests,
    long pendingRoomChangeRequests,
    long upcomingExits,
    long tenantsOnNotice
) {
}
