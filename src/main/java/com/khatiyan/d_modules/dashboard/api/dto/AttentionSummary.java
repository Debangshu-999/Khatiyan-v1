package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * "What needs attention" rollup for a single property — the actionable queue.
 * {@code upcomingExits} counts approved exits whose checkout falls within the
 * configured upcoming-exit window. {@code exitsPastDue} counts exits that are
 * overdue but not yet executed — approved monthly exits past their checkout date
 * plus active daily tenancies past their end date.
 */
public record AttentionSummary(
    long paymentsOverdue,
    long concernsUnattended24h,
    long escalatedConcerns,
    long pendingExitRequests,
    long pendingRoomChangeRequests,
    long upcomingExits,
    long exitsPastDue,
    long tenantsOnNotice,
    long pendingDepositSettlements,
    /** Enquiries from the property's public profile with no answer yet. */
    long newEnquiries,
    /**
     * Salaries unpaid for the current payroll month.
     *
     * <p>Counted the whole month, not just the last few days. The end-of-month
     * reminder is a nudge about a deadline; this is the standing task.
     */
    long salaryPaymentsDue,
    /** Agreements signed by the owner and still waiting on the tenant. */
    long agreementsPendingAcceptance
) {
}
