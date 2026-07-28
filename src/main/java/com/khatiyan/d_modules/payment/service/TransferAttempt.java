package com.khatiyan.d_modules.payment.service;

/**
 * Outcome of trying to pay an owner their share.
 *
 * <p>Exists because the alternative — inferring success from whether a ledger
 * row appeared — cannot tell a sent transfer from a failed one, since both leave
 * a row behind. The row is written before the gateway call on purpose, so its
 * presence proves an attempt was made, not that money moved.
 */
public enum TransferAttempt {

    /** The gateway accepted the transfer. */
    SENT,

    /**
     * Not attempted, and safe to attempt again later: the fee was not published
     * yet, the owner's payout account was not ready, or the gateway was
     * unreachable. The money is still in the platform account.
     */
    DEFERRED,

    /** The gateway rejected it. Recoverable, but usually needs the owner to act. */
    FAILED,

    /** A transfer already exists for this cycle. Never send a second one. */
    ALREADY_TRANSFERRED,

    /** Route is off, so payouts are not being made at all. */
    DISABLED
}
