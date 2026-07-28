package com.khatiyan.d_modules.payment.model;

/** Lifecycle of a payout from a tenant's payment to the property owner. */
public enum OwnerTransferStatus {

    /** Created at the gateway; outcome not yet confirmed by webhook. */
    PENDING,

    /** {@code transfer.processed} — the gateway accepted and processed it. */
    PROCESSED,

    /** {@code settlement.processed} — the money reached the owner's bank. */
    SETTLED,

    /**
     * {@code transfer.failed}. The money never left the platform account, so it
     * is recoverable — but retries only help transient causes. Wrong bank
     * details need the owner to fix them before a retry can succeed.
     */
    FAILED
}
