package com.khatiyan.d_modules.payment;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.payment.api.dto.CreatePaymentOrderRequest;
import com.khatiyan.d_modules.payment.api.dto.PaymentOrderResponse;
import com.khatiyan.d_modules.payment.api.dto.IfscLookupResponse;
import com.khatiyan.d_modules.payment.api.dto.PaymentWebhookEventResponse;
import com.khatiyan.d_modules.payment.api.dto.PayoutAccountResponse;
import com.khatiyan.d_modules.payment.api.dto.RecordClientPaymentFailureRequest;
import com.khatiyan.d_modules.payment.api.dto.SetupPayoutAccountRequest;
import com.khatiyan.d_modules.payment.api.dto.VerifyProviderPaymentRequest;
import com.khatiyan.d_modules.payment.service.PaymentPayoutService;
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
    private final PaymentPayoutService paymentPayoutService;

    public PaymentModule(PaymentService paymentService, PaymentPayoutService paymentPayoutService) {
        this.paymentService = paymentService;
        this.paymentPayoutService = paymentPayoutService;
    }

    public IfscLookupResponse lookupIfsc(String ifsc) {
        return paymentPayoutService.lookupIfsc(ifsc);
    }

    public List<PayoutAccountResponse> listPayoutAccounts(UUID ownerUserId) {
        return paymentPayoutService.listPayoutAccounts(ownerUserId);
    }

    public PayoutAccountResponse addPayoutAccount(UUID ownerUserId, SetupPayoutAccountRequest request) {
        return paymentPayoutService.addPayoutAccount(ownerUserId, request);
    }

    public PayoutAccountResponse updatePayoutAccount(
            UUID ownerUserId,
            UUID accountId,
            SetupPayoutAccountRequest request) {
        return paymentPayoutService.updatePayoutAccount(ownerUserId, accountId, request);
    }

    public void deletePayoutAccount(UUID ownerUserId, UUID accountId) {
        paymentPayoutService.deletePayoutAccount(ownerUserId, accountId);
    }

    public List<PayoutAccountResponse> setPrimaryPayoutAccount(UUID ownerUserId, UUID accountId) {
        return paymentPayoutService.setPrimaryPayoutAccount(ownerUserId, accountId);
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
