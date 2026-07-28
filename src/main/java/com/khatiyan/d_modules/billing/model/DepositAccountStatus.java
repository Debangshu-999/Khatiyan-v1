package com.khatiyan.d_modules.billing.model;

/**
 * Lifecycle state of a tenancy deposit account.
 *
 * <ul>
 *   <li>{@code ACTIVE} — the tenancy is live; the deposit secures the stay;</li>
 *   <li>{@code PENDING_SETTLEMENT} — the tenancy has ended but the owner chose to
 *       settle the deposit later; it awaits settlement (surfaced in the action
 *       center);</li>
 *   <li>{@code SETTLED} — settled and closed.</li>
 * </ul>
 */
public enum DepositAccountStatus {
    ACTIVE,
    PENDING_SETTLEMENT,
    SETTLED
}