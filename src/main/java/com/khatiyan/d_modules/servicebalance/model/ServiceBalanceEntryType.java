package com.khatiyan.d_modules.servicebalance.model;

/**
 * What a ledger row did to the balance.
 *
 * <p>The split that matters is whether money physically left Khatiyan.
 * {@link #RESERVE}, {@link #RELEASE} and {@link #ADJUSTMENT} only move numbers
 * between counters on one account. {@link #REFUND} and {@link #CHARGEBACK} send
 * money back out to the card it came from, which needs the gateway, a GST
 * reversal and a failure path. Naming those the same thing would hide all of it.
 */
public enum ServiceBalanceEntryType {

    /** Money in, from a captured gateway payment. Available goes up. */
    TOPUP,

    /** Held against requested work. Available down, reserved up. Nothing spent. */
    RESERVE,

    /** The held work never happened. Reserved back to available. */
    RELEASE,

    /** The provider billed us. Reserved goes down and the money is gone. */
    CHARGE,

    /** Money returned to the original payment method. Available goes down. */
    REFUND,

    /** The bank clawed a payment back without asking. Available goes down. */
    CHARGEBACK,

    /**
     * A top-up paying off what was owed.
     *
     * <p>Its own line rather than a smaller TOPUP, so the statement can say
     * "Money added" and "Pending charges cleared" separately. An owner whose
     * Rs 500 quietly became Rs 460 deserves to see where the difference went.
     */
    DUES_SETTLED,

    /** A correction or goodwill credit. Stays inside the closed loop. */
    ADJUSTMENT
}
