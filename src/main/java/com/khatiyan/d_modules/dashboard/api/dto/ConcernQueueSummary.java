package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Concern queue rollup for a single property. "Under review" and "in progress"
 * are separate owner-visible stages; "escalated" only counts unassigned
 * escalated concerns that still need property-level action.
 * "Resolved this week" uses a rolling 7-day window.
 */
public record ConcernQueueSummary(
    long open,
    long underReview,
    long inProgress,
    long escalated,
    long reopened,
    long resolvedThisWeek
) {
}
