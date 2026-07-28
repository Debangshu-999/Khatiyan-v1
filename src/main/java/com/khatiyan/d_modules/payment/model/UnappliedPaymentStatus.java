package com.khatiyan.d_modules.payment.model;

/** Resolution state of money held that belongs to nobody's bill. */
public enum UnappliedPaymentStatus {

    /** Held in the platform account, owed back to the tenant. */
    PENDING_REFUND,

    REFUNDED,

    /** Closed without a refund (e.g. applied manually elsewhere); needs a note. */
    WRITTEN_OFF
}
