package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Concern queue rollup for a single property. "Resolved this week" uses a
 * rolling 7-day window.
 */
public record ConcernQueueSummary(
    long open,
    long inProgress,
    long escalated,
    long resolvedThisWeek
) {
}
