package com.khatiyan.d_modules.servicebalance.model;

/**
 * Why money is going back.
 *
 * <p>Worth recording as data rather than free text: these three answer very
 * different questions when an owner asks later why they were or were not
 * refunded, and the first one is not even the owner's doing.
 */
public enum ServiceBalanceRefundReason {

    /**
     * Money reached the gateway but never reached a balance.
     *
     * <p>A webhook lost, a top-up that expired first, a payment against an
     * order we cannot match. Automatic, and never waits for a complaint.
     */
    UNAPPLIED_PAYMENT,

    /** Credited, unspent, and the owner wants it back or is closing. */
    UNUSED_BALANCE,

    /** We charged wrongly and the owner wants money rather than credit. */
    BILLING_ERROR
}
