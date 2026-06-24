package com.khatiyan.d_modules.concerns.api.dto;

/**
 * Property-scoped concern rollup for the owner action center.
 *
 * <p>"Raised today" uses the current IST date; "resolved this week" uses a
 * rolling 7-day window; "under review" and "in progress" are reported separately;
 * "unattended 24h" counts open, still-unassigned concerns older than 24 hours.
 */
public record ConcernDashboardSummary(
    long open,
    long underReview,
    long inProgress,
    long escalated,
    long actionableEscalated,
    long reopened,
    long resolvedThisWeek,
    long raisedToday,
    long unattended24h
) {
}
