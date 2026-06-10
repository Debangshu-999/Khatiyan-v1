package com.khatiyan.d_modules.payment;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.payment.api.dto.CreatePaymentOrderRequest;
import com.khatiyan.d_modules.payment.api.dto.PaymentOrderResponse;
import com.khatiyan.d_modules.payment.api.dto.PaymentWebhookEventResponse;
import com.khatiyan.d_modules.payment.api.dto.RecordClientPaymentFailureRequest;
import com.khatiyan.d_modules.payment.api.dto.VerifyProviderPaymentRequest;
import com.khatiyan.d_modules.payment.service.PaymentService;

/**
 * Public facade for the payment module.
 *
 * <p>Other modules should depend on this facade instead of importing payment
 * services or entities directly. Service methods will be added as provider
 * and billing integration flows are implemented.
 */
@Component
public class PaymentModule {

    private final PaymentService paymentService;

    public PaymentModule(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    public PaymentOrderResponse createOrderForBillingCycle(
            UUID tenantUserId,
            UUID billingCycleId,
            CreatePaymentOrderRequest request) {
        return paymentService.createOrderForBillingCycle(tenantUserId, billingCycleId, request);
    }

    public PaymentOrderResponse verifyCheckoutReturn(
            UUID tenantUserId,
            VerifyProviderPaymentRequest request) {
        return paymentService.verifyCheckoutReturn(tenantUserId, request);
    }

    public PaymentOrderResponse verifyCheckoutReturnPublic(VerifyProviderPaymentRequest request) {
        return paymentService.verifyCheckoutReturnPublic(request);
    }

    public PaymentOrderResponse getCheckoutOrder(UUID paymentOrderId) {
        return paymentService.getCheckoutOrder(paymentOrderId);
    }

    public PaymentWebhookEventResponse handleRazorpayWebhook(
            String payloadJson,
            String signature,
            String providerEventIdHeader) {
        return paymentService.handleRazorpayWebhook(payloadJson, signature, providerEventIdHeader);
    }

    public PaymentOrderResponse recordClientPaymentFailure(
            UUID tenantUserId,
            UUID paymentOrderId,
            RecordClientPaymentFailureRequest request) {
        return paymentService.recordClientPaymentFailure(tenantUserId, paymentOrderId, request);
    }
}
