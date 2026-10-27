package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * "What needs attention" rollup for a single property — the actionable queue.
 * Upcoming exits, checkouts due today and past-due exits are separate queues.
 * Checkout uses a notice's end date, or the planned end of a daily/fixed-term
 * stay, so a fixed term does not need an exit request to need attention.
 */
public record AttentionSummary(
    long paymentsOverdue,
    long concernsUnattended24h,
    long escalatedConcerns,
    long pendingExitRequests,
    long pendingRoomChangeRequests,
    long upcomingExits,
    /** Current stays whose effective checkout is today, including fixed terms without an exit request. */
    long exitsDueToday,
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
