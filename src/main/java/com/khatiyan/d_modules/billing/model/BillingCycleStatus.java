package com.khatiyan.d_modules.billing.model;

/**
 * Lifecycle state of a billing cycle.
 *
 * <p>
 * V1 intentionally does not support partial payments. A cycle is either
 * upcoming, unpaid, overdue, fully paid, or cancelled before payment.
 *
 * <p>
 * {@code UPCOMING} is the only mutable state. A cycle is generated ahead of its
 * period start in this state, where owners may add charges and the property's
 * late-fee rate still applies to it. When its window opens the cycle activates
 * to {@code UNPAID}, freezing both its charges and its late-fee rate — from
 * that moment nothing can change its total, so a tenant always pays exactly the
 * amount they were shown. Charges arising afterwards belong to the next cycle.
 */
public enum BillingCycleStatus {
    UPCOMING,
    UNPAID,
    OVERDUE,

    /**
     * The tenant says they have paid and the owner has not yet checked.
     *
     * <p>
     * Deliberately NOT a kind of paid. The money is only counted once the owner
     * confirms it against their own bank statement, and every collected figure
     * in the app filters on {@link #PAID} — so a claim awaiting verification
     * moves nothing, and a rejected one has nothing to unwind.
     *
     * <p>
     * It is also not a kind of unpaid, and that is what freezes the late-fee
     * clock: the overdue marker and the late-fee recalculation both select only
     * UNPAID and OVERDUE, so a cycle sitting here is passed over by both. On
     * rejection it returns to UNPAID and the next recalculation charges the days
     * that elapsed, because that sweep recomputes from the due date rather than
     * adding to a running total. A tenant is therefore not charged for the
     * owner's delay, and a false claim buys no free time.
     */
    CONFIRMATION_PENDING,

    PAID,
    CANCELLED
}