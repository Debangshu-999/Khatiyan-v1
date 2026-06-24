package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * One month of trend data for the dashboard bar charts. Rates are whole
 * percentages in the range 0..100. {@code label} is a short month name in the
 * IST calendar (e.g. "Jun"). {@code collectedPaise} is the total amount
 * collected in the month, used by the money-scaled collection chart.
 */
public record MonthlyTrendPoint(
    String label,
    int occupancyRate,
    int collectionRate,
    long collectedPaise
) {
}
