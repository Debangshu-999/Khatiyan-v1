package com.khatiyan.d_modules.payment.model;

/** Why a captured payment could not be applied to its billing cycle. */
public enum UnappliedPaymentReason {

    /** The bill was already settled — typically an offline payment recorded meanwhile. */
    CYCLE_ALREADY_PAID,

    /** The cycle was cancelled while the tenant had checkout open. */
    CYCLE_CANCELLED,

    /** The order was expired or cancelled by the time the gateway captured. */
    ORDER_NOT_PAYABLE,

    /** Billing rejected the payment for a reason we did not anticipate. */
    APPLY_FAILED
}
