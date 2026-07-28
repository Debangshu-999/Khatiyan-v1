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

    /**
     * Creates (or begins activation of) an owner payout account for split
     * settlement (Razorpay Route linked account).
     */
    LinkedAccountResult createLinkedAccount(CreateLinkedAccountCommand command);

    /**
     * Reads a captured payment back from the gateway, including the fee it
     * actually charged. Fetched rather than taken from the webhook payload
     * because the fee is not guaranteed to be populated at capture time.
     */
    ProviderPaymentDetails fetchPayment(String providerPaymentId);

    /** Moves the owner's net share of a captured payment to their linked account. */
    ProviderTransfer createTransfer(CreateProviderTransferCommand command);

    /**
     * Returns money to the method the tenant paid with. No bank details are
     * needed — the gateway refunds to source — which is why this can be
     * automated where a deposit refund cannot.
     */
    ProviderRefund refundPayment(String providerPaymentId, long amountPaise);

    ProviderPaymentVerification verifyReturnPayload(VerifyProviderPaymentCommand command);

    ProviderWebhookVerification verifyWebhook(String payloadJson, String signature);
}
