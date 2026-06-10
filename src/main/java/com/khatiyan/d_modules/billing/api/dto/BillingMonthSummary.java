package com.khatiyan.d_modules.billing.api.dto;

/**
 * Month-scoped billing summary for the owner billing screen (active tab).
 *
 * <p>All metrics cover cycles whose period starts in the selected IST month.
 * {@code hasData} is false when the month has no cycles, so the UI can show a
 * "no data available" state for past months.
 */
public record BillingMonthSummary(
    String month,
    boolean hasData,
    long activeCycleCount,
    long overdueCount,
    long overduePaise,
    long paidCycleCount,
    long unpaidCycleCount,
    long billedPaise,
    long collectedPaise,
    long totalDiscountPaise,
    long manuallyPaidCycleCount,
    long manuallyPaidPaise
) {
}
