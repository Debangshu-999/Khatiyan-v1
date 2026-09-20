package com.khatiyan.d_modules.servicebalance.model;

/** Where one refund got to. */
public enum ServiceBalanceRefundStatus {

    /**
     * Written down, not yet sent.
     *
     * <p>The money has already left the balance and the row is committed before
     * the gateway is called. If this process dies mid-refund, the sweep finds
     * the row and sends it — rather than the alternative, where a crash between
     * two gateway calls leaves one refund sent and the ledger denying it.
     */
    REQUESTED,

    /** Sent to the gateway, awaiting its answer. */
    SENT,

    /** The gateway says the money is on its way back. */
    PROCESSED,

    /**
     * The gateway refused it.
     *
     * <p>A closed card, a dead account, a window that has passed. The money
     * goes back onto the balance rather than disappearing.
     */
    FAILED
}
