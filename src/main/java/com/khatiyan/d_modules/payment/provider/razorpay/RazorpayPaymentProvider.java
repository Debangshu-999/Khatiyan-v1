package com.khatiyan.d_modules.payment.provider.razorpay;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.json.JSONObject;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.payment.model.PaymentMethod;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.provider.CreateProviderPaymentOrderCommand;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderUnavailableException;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentOrder;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentVerification;
import com.khatiyan.d_modules.payment.provider.ProviderWebhookVerification;
import com.khatiyan.d_modules.payment.provider.VerifyProviderPaymentCommand;
import com.razorpay.Order;
import com.razorpay.RazorpayClient;
import com.razorpay.RazorpayException;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.extern.slf4j.Slf4j;

/**
 * Razorpay implementation of the payment provider abstraction.
 *
 * <p>
 * This class is the only payment component that knows Razorpay request fields,
 * signatures, and SDK types. The payment service continues to work with the
 * provider-neutral {@link PaymentProvider} interface.
 */
@Slf4j
@Component
@ConditionalOnProperty(
        prefix = "app.payment",
        name = "default-provider",
        havingValue = "RAZORPAY",
        matchIfMissing = true)
public class RazorpayPaymentProvider implements PaymentProvider {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private final RazorpayPaymentProperties properties;

    public RazorpayPaymentProvider(RazorpayPaymentProperties properties) {
        this.properties = properties;
    }

    @Override
    public PaymentProviderType type() {
        return PaymentProviderType.RAZORPAY;
    }

    @Override
    @CircuitBreaker(name = "razorpay", fallbackMethod = "createOrderFallback")
    public ProviderPaymentOrder createOrder(CreateProviderPaymentOrderCommand command) {
        validateKeysConfigured();

        try {
            RazorpayClient client = new RazorpayClient(properties.keyId(), properties.keySecret());

            JSONObject orderRequest = new JSONObject();
            orderRequest.put("amount", command.amountPaise());
            orderRequest.put("currency", command.currency());
            orderRequest.put("receipt", command.receiptReference());
            orderRequest.put("payment_capture", true);
            orderRequest.put("notes", notes(command));

            Order order = client.orders.create(orderRequest);
            String providerOrderId = order.get("id");

            return new ProviderPaymentOrder(
                    providerOrderId,
                    providerOrderId,
                    order.toString());
        } catch (RazorpayException exception) {
            throw new PaymentProviderUnavailableException("Payment gateway is temporarily unavailable. Please try again shortly.");
        }
    }

    @SuppressWarnings("unused")
    private ProviderPaymentOrder createOrderFallback(
            CreateProviderPaymentOrderCommand command,
            Throwable exception) {
        log.warn(
                "Razorpay circuit breaker blocked order creation paymentOrderId={} billingCycleId={} reason={}",
                command.paymentOrderId(),
                command.billingCycleId(),
                exception.getMessage());

        throw new PaymentProviderUnavailableException("Payment gateway is temporarily unavailable. Please try again shortly.");
    }

    @Override
    public ProviderPaymentVerification verifyReturnPayload(VerifyProviderPaymentCommand command) {
        validateKeysConfigured();

        String expectedSignature = hmacSha256(
                command.providerOrderId() + "|" + command.providerPaymentId(),
                properties.keySecret());

        if (!constantTimeEquals(expectedSignature, command.signature())) {
            return ProviderPaymentVerification.invalid("Razorpay payment signature is invalid");
        }

        return new ProviderPaymentVerification(
                true,
                command.providerOrderId(),
                command.providerPaymentId(),
                "signature_verified",
                PaymentMethod.UNKNOWN,
                Instant.now(),
                null,
                null);
    }

    @Override
    public ProviderWebhookVerification verifyWebhook(String payloadJson, String signature) {
        String webhookSecret = properties.webhookSecret();
        if (webhookSecret == null || webhookSecret.isBlank()) {
            return ProviderWebhookVerification.invalid("Razorpay webhook secret is not configured");
        }

        boolean signatureValid = constantTimeEquals(
                hmacSha256(payloadJson, webhookSecret),
                signature);

        JSONObject payload = new JSONObject(payloadJson);
        String eventType = payload.optString("event", null);
        String providerEventId = payload.optString("id", null);
        JSONObject paymentEntity = paymentEntity(payload);

        String providerOrderId = null;
        String providerPaymentId = null;
        Long amountPaise = null;
        String currency = null;
        String providerStatus = null;
        PaymentMethod method = PaymentMethod.UNKNOWN;
        Instant paidAt = null;
        String failureCode = null;
        String failureReason = null;

        if (paymentEntity != null) {
            providerPaymentId = paymentEntity.optString("id", null);
            providerOrderId = paymentEntity.optString("order_id", null);
            currency = paymentEntity.optString("currency", null);
            providerStatus = paymentEntity.optString("status", null);
            method = mapMethod(paymentEntity.optString("method", null));

            if (paymentEntity.has("amount")) {
                amountPaise = paymentEntity.getLong("amount");
            }
            if (paymentEntity.has("created_at")) {
                paidAt = Instant.ofEpochSecond(paymentEntity.getLong("created_at"));
            }

            failureCode = paymentEntity.optString("error_code", null);
            failureReason = paymentEntity.optString("error_description", null);
        }

        return new ProviderWebhookVerification(
                signatureValid,
                providerEventId,
                eventType,
                providerOrderId,
                providerPaymentId,
                amountPaise,
                currency,
                providerStatus,
                method,
                paidAt,
                failureCode,
                failureReason);
    }

    private JSONObject notes(CreateProviderPaymentOrderCommand command) {
        JSONObject notes = new JSONObject();
        notes.put("paymentOrderId", command.paymentOrderId().toString());
        notes.put("billingCycleId", command.billingCycleId().toString());
        notes.put("tenancyId", command.tenancyId().toString());
        notes.put("tenantUserId", command.tenantUserId().toString());
        notes.put("propertyId", command.propertyId().toString());
        notes.put("description", command.description());

        return notes;
    }

    private JSONObject paymentEntity(JSONObject payload) {
        JSONObject payloadNode = payload.optJSONObject("payload");
        if (payloadNode == null) {
            return null;
        }

        JSONObject paymentNode = payloadNode.optJSONObject("payment");
        if (paymentNode == null) {
            return null;
        }

        return paymentNode.optJSONObject("entity");
    }

    private PaymentMethod mapMethod(String providerMethod) {
        if (providerMethod == null || providerMethod.isBlank()) {
            return PaymentMethod.UNKNOWN;
        }

        String normalizedMethod = providerMethod.trim().toUpperCase();
        if ("UPI".equals(normalizedMethod)) {
            return PaymentMethod.UPI;
        }
        if ("CARD".equals(normalizedMethod)) {
            return PaymentMethod.CARD;
        }
        if ("NETBANKING".equals(normalizedMethod)) {
            return PaymentMethod.NETBANKING;
        }
        if ("WALLET".equals(normalizedMethod)) {
            return PaymentMethod.WALLET;
        }
        if ("EMI".equals(normalizedMethod)) {
            return PaymentMethod.EMI;
        }
        if ("PAYLATER".equals(normalizedMethod)) {
            return PaymentMethod.PAYLATER;
        }

        return PaymentMethod.UNKNOWN;
    }

    private void validateKeysConfigured() {
        if (properties.keyId() == null || properties.keyId().isBlank()) {
            throw new ValidationException("Razorpay key id is not configured");
        }
        if (properties.keySecret() == null || properties.keySecret().isBlank()) {
            throw new ValidationException("Razorpay key secret is not configured");
        }
    }

    private String hmacSha256(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256);
            mac.init(keySpec);

            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new IllegalStateException("HMAC SHA-256 is not available", exception);
        }
    }

    private boolean constantTimeEquals(String expected, String actual) {
        if (expected == null || actual == null) {
            return false;
        }

        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
