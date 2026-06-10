package com.khatiyan.d_modules.billing.api.dto;

/**
 * Summary for the owner billing screen's "past cycles" tab — cycles belonging
 * to inactive (ended) tenancies of the property.
 */
public record BillingPastSummary(
    long olderCycleCount,
    long paidCount,
    long paidPaise,
    long unpaidCount,
    long unpaidPaise
) {
}
