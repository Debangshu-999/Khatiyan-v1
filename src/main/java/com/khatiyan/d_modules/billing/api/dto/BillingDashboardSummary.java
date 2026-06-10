package com.khatiyan.d_modules.billing.api.dto;

/**
 * Property-scoped billing rollup for the owner action center.
 *
 * <p>All amounts are in paise. "This month" and "today" are resolved in IST
 * by the billing service so the figures match the rest of the app's day
 * boundaries.
 */
public record BillingDashboardSummary(
    long billedThisMonthPaise,
    long collectedThisMonthPaise,
    long pendingPaise,
    long overduePaise,
    long overdueCount,
    long paymentsMadeToday,
    long paymentsMadeTodayPaise,
    long activeCycleCount,
    long paidCycleCount,
    long manuallyPaidCycleCount,
    long unpaidCycleCount,
    long totalCollectedPaise,
    long manuallyCollectedPaise,
    long totalDiscountPaise
) {
}
