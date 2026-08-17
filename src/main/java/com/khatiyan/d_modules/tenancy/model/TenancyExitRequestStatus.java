package com.khatiyan.d_modules.tenancy.model;

/**
 * Lifecycle state for a tenancy exit request.
 *
 * <pre>
 *                  ┌──────────────── EXPIRED (nobody reviewed it in time)
 *                  │
 *   REQUESTED ─────┼──── REJECTED (reason mandatory; may be re-raised)
 *        │         │
 *        │         └──── CANCELLED (tenant withdrew, unilateral)
 *        │
 *     APPROVED ──── WITHDRAWAL_REQUESTED ──┬── CANCELLED (owner allowed it)
 *        │                                 └── APPROVED  (owner vetoed it)
 *        │
 *     EXECUTED
 * </pre>
 */
public enum TenancyExitRequestStatus {
    REQUESTED,
    APPROVED,
    REJECTED,
    CANCELLED,
    EXECUTED,

    /**
     * Nobody reviewed the request within the review window.
     *
     * <p>Deliberately inert: no notice is served, no cycle is skipped, nothing
     * about the tenancy changes. Auto-approving would put a tenant on notice —
     * which skips billing and marks the bed for turnover — because nobody
     * clicked, and auto-rejecting would hand a stonewalling owner exactly the
     * outcome they wanted. Expiry is the only option that changes nothing.
     *
     * <p>The tenant is not made to pay for it either: an expired request may be
     * re-raised outside the payment window, with the notice still running from
     * the original request date.
     */
    EXPIRED,

    /**
     * The tenant has asked to undo an already-approved exit.
     *
     * <p>Not a terminal state and not a unilateral one — unlike withdrawing
     * before approval, this needs the owner's agreement, because they may
     * already have promised the bed. The tenancy stays on notice while the
     * request sits here, so nothing about billing or turnover moves until the
     * owner decides.
     */
    WITHDRAWAL_REQUESTED
}
