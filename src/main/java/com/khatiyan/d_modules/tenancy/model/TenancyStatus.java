package com.khatiyan.d_modules.tenancy.model;

public enum TenancyStatus {
    // Created with an agreement but not yet accepted by the tenant: the bed is
    // reserved, but the user is not an active tenant and billing has not started.
    PENDING_ACCEPTANCE,
    /** Accepted or guest-recorded booking waiting for its approved room change. */
    SCHEDULED,
    ACTIVE,
    ON_NOTICE,
    ON_PREMATURE_NOTICE,
    /**
     * Past its checkout date and waiting for a person to end it. Nothing ends a
     * stay by itself, so the bed stays held and {@code is_active} stays true,
     * but everything else on the account halts: new bills, late fees, rent
     * reminders, the food subscription, and every request. Left only by being
     * ended. See docs/superpowers/specs/2026-09-26-pending-exit-design.md.
     */
    PENDING_EXIT,
    EXITED,
    EVICTED,
    // A pending tenancy the tenant declined, or that expired before acceptance.
    CANCELLED
}
