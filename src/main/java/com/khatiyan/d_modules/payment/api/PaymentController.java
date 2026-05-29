package com.khatiyan.d_modules.payment.api;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.payment.PaymentModule;
import com.khatiyan.d_modules.payment.api.dto.CreatePaymentOrderRequest;
import com.khatiyan.d_modules.payment.api.dto.PaymentOrderResponse;
import com.khatiyan.d_modules.payment.api.dto.PaymentWebhookEventResponse;
import com.khatiyan.d_modules.payment.api.dto.RecordClientPaymentFailureRequest;
import com.khatiyan.d_modules.payment.api.dto.VerifyProviderPaymentRequest;

import jakarta.validation.Valid;

/**
 * REST API boundary for tenant payment checkout actions.
 *
 * <p>
 * The controller receives the standard {@code Idempotency-Key} header and
 * forwards it into the payment service. Amounts are never accepted from the
 * frontend; the service derives payable amounts from billing cycles.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private final PaymentModule paymentModule;

    public PaymentController(PaymentModule paymentModule) {
        this.paymentModule = paymentModule;
    }

    @PostMapping("/billing-cycles/{billingCycleId}/orders")
    public ResponseEntity<PaymentOrderResponse> createOrderForBillingCycle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody(required = false) CreatePaymentOrderRequest request) {
        CreatePaymentOrderRequest resolvedRequest = resolveRequest(request, idempotencyKey);
        PaymentOrderResponse response = paymentModule.createOrderForBillingCycle(
                user.userId(),
                billingCycleId,
                resolvedRequest);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .header(HttpHeaders.LOCATION, "/api/v1/payments/orders/" + response.id())
                .location(URI.create("/api/v1/payments/orders/" + response.id()))
                .body(response);
    }

    @PostMapping("/orders/verify")
    public ResponseEntity<PaymentOrderResponse> verifyCheckoutReturn(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody VerifyProviderPaymentRequest request) {
        PaymentOrderResponse response = paymentModule.verifyCheckoutReturn(user.userId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/orders/{paymentOrderId}/client-failure")
    public ResponseEntity<PaymentOrderResponse> recordClientPaymentFailure(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID paymentOrderId,
            @Valid @RequestBody RecordClientPaymentFailureRequest request) {
        PaymentOrderResponse response = paymentModule.recordClientPaymentFailure(
                user.userId(),
                paymentOrderId,
                request);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/webhooks/razorpay")
    public ResponseEntity<PaymentWebhookEventResponse> handleRazorpayWebhook(
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature,
            @RequestHeader(name = "X-Razorpay-Event-Id", required = false) String eventId,
            @RequestBody String payloadJson) {
        PaymentWebhookEventResponse response = paymentModule.handleRazorpayWebhook(
                payloadJson,
                signature,
                eventId);
        return ResponseEntity.ok(response);
    }

    private CreatePaymentOrderRequest resolveRequest(
            CreatePaymentOrderRequest request,
            String idempotencyKey) {
        if (request == null) {
            return new CreatePaymentOrderRequest(null, idempotencyKey);
        }

        String resolvedKey = idempotencyKey;
        if (resolvedKey == null || resolvedKey.isBlank()) {
            resolvedKey = request.idempotencyKey();
        }

        return new CreatePaymentOrderRequest(request.provider(), resolvedKey);
    }
}
