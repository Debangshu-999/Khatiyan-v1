package com.khatiyan.d_modules.servicebalance.model;

/**
 * Where one top-up attempt got to.
 *
 * <p>{@link #AUTHORIZED} exists because we capture manually. The gateway holds
 * an authorised payment for three days and then refunds it by itself, so a
 * payment we cannot match to a top-up is simply left uncaptured — the money goes
 * back on its own, and because it was never captured we are charged no fee for
 * it. Auto-capturing would turn every one of those into a real refund with the
 * gateway's cut permanently lost.
 */
public enum ServiceBalanceTopUpStatus {

    /** Order created, checkout not finished. */
    CREATED,

    /** The payer authorised it. Not captured, so not yet our money. */
    AUTHORIZED,

    /** Captured and credited. */
    PAID,

    /** The gateway reported a failed payment. */
    FAILED,

    /** Checkout was abandoned and the order window closed. */
    EXPIRED
}
