package com.khatiyan.d_modules.payment.provider;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * Gateway abstraction for external payment providers.
 *
 * <p>The payment service should depend on this interface, not on Razorpay,
 * Cashfree, or any provider SDK directly. This keeps provider-specific code
 * contained and replaceable.
 */
public interface PaymentProvider {

    PaymentProviderType type();

    ProviderPaymentOrder createOrder(CreateProviderPaymentOrderCommand command);

    ProviderPaymentVerification verifyReturnPayload(VerifyProviderPaymentCommand command);

    ProviderWebhookVerification verifyWebhook(String payloadJson, String signature);
}
