package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Money rollup for a single property in the current IST month. All amounts
 * are in paise.
 */
public record MoneySnapshot(
    long billedThisMonthPaise,
    long collectedThisMonthPaise,
    long pendingPaise,
    long overduePaise,
    long overdueCount,
    long billedPrevMonthPaise,
    long collectedPrevMonthPaise
) {
}
