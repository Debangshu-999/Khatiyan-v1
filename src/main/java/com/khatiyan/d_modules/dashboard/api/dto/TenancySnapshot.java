package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Tenancy movement snapshot for a single property. Month-scoped started/ended
 * counts use the IST calendar month; {@code upcomingExits} counts approved exit
 * requests whose checkout falls within the configured upcoming window.
 */
public record TenancySnapshot(
    long activeTenants,
    long onNotice,
    long startedThisMonth,
    long endedThisMonth,
    long upcomingExits,
    long activeTenantsPrevMonth,
    long startedPrevMonth,
    long endedPrevMonth
) {
}
