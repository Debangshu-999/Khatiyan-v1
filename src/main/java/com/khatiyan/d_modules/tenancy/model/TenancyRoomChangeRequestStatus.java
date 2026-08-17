package com.khatiyan.d_modules.tenancy.model;

/**
 * Lifecycle state for a tenant-initiated room change request.
 *
 * <p>Deliberately narrower than {@link TenancyExitRequestStatus}. A room change
 * is a favour the owner grants, so they hold a real veto: there is no withdrawal
 * after approval, and a refused request carries no entitlement to re-raise on
 * the original terms. An exit is the opposite — a tenant serving notice is
 * exercising a right, which is why only that flow gets those affordances.
 */
public enum TenancyRoomChangeRequestStatus {
    REQUESTED,
    APPROVED,
    REJECTED,
    CANCELLED,
    EXECUTED,

    /**
     * Nobody reviewed the request within the review window.
     *
     * <p>Same reasoning as on exits: expiry changes nothing, which is what makes
     * it safe to apply automatically. Unlike exits it comes with no re-raise
     * carve-out — the tenant simply asks again.
     */
    EXPIRED
}
