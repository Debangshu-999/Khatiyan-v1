package com.khatiyan.d_modules.payment.model;

/**
 * External payment gateway used for collecting money.
 *
 * <p>The payment module stays provider-neutral. Razorpay can be the first
 * implementation, while Cashfree or another provider can be added later
 * behind the same payment service flow.
 */
public enum PaymentProviderType {
    RAZORPAY,
    CASHFREE
}
