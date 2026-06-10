package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * "What happened today" digest for a single property. All windows are the
 * current IST date.
 */
public record TodayDigest(
    long paymentsMadeToday,
    long paymentsMadeTodayPaise,
    long concernsRaisedToday,
    long tenanciesStartedToday,
    long tenanciesEndingToday
) {
}
