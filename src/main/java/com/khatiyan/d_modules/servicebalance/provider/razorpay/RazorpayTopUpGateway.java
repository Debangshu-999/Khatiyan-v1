package com.khatiyan.d_modules.servicebalance.provider.razorpay;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceProperties;

import lombok.extern.slf4j.Slf4j;
// Jackson 3: Boot 4's RestClient converters produce tools.jackson types.
import tools.jackson.databind.JsonNode;

/**
 * Razorpay, for top-ups only.
 *
 * <p>Deliberately small and separate from the parked payment module's provider,
 * which carries Route, linked accounts and transfers — all of which stay parked
 * for regulatory reasons. Khatiyan is the merchant of record for a top-up
 * because it is selling its own service, so nothing here splits or forwards
 * money to anyone.
 *
 * <p><b>Orders are created without auto-capture.</b> A payment we cannot match
 * to a top-up is left alone: the gateway refunds an uncaptured authorisation by
 * itself after three days, and charges us nothing for it. Capturing first and
 * refunding later would cost the gateway's cut on every mismatch, permanently.
 */
@Slf4j
@Component
public class RazorpayTopUpGateway {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private final RestClient restClient;
    private final ServiceBalanceProperties properties;

    public RazorpayTopUpGateway(RestClient.Builder restClientBuilder, ServiceBalanceProperties properties) {
        this.properties = properties;
        this.restClient = restClientBuilder.build();
    }

    /** Creates the order the app's checkout opens against. */
    public String createOrder(long amountPaise, String receipt) {
        requireConfigured();
        JsonNode response = restClient.post()
                .uri(properties.getRazorpay().getBaseUrl() + "/orders")
                .header(HttpHeaders.AUTHORIZATION, basicAuth())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "amount", amountPaise,
                        "currency", properties.getCurrency(),
                        "receipt", receipt,
                        // Manual capture. See the class note.
                        "payment_capture", 0))
                .retrieve()
                .body(JsonNode.class);

        if (response == null || response.path("id").asString("").isBlank()) {
            throw new BusinessException("TOP_UP_ORDER_FAILED", "Could not start the payment. Try again in a moment.");
        }
        return response.path("id").asString();
    }

    /**
     * Takes the money, once the payment is matched to a top-up.
     *
     * @return the payment id when captured
     */
    public String capture(String paymentId, long amountPaise) {
        requireConfigured();
        JsonNode response = restClient.post()
                .uri(properties.getRazorpay().getBaseUrl() + "/payments/" + paymentId + "/capture")
                .header(HttpHeaders.AUTHORIZATION, basicAuth())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountPaise, "currency", properties.getCurrency()))
                .retrieve()
                .body(JsonNode.class);

        if (response == null || !"captured".equals(response.path("status").asString(""))) {
            throw new BusinessException(
                    "TOP_UP_CAPTURE_FAILED",
                    "The payment could not be confirmed. It will be returned automatically.");
        }
        return response.path("id").asString(paymentId);
    }

    /**
     * Sends money back to the card that paid it.
     *
     * <p>Against the original payment, which is the only destination this
     * product has. There is no "refund to another account" here and there must
     * never be one — that is a withdrawal, and withdrawals are what turn a
     * closed balance into a regulated payment instrument.
     *
     * @return the gateway's refund id
     */
    public String refund(String paymentId, long amountPaise, String idempotencyKey) {
        requireConfigured();
        JsonNode response = restClient.post()
                .uri(properties.getRazorpay().getBaseUrl() + "/payments/" + paymentId + "/refund")
                .header(HttpHeaders.AUTHORIZATION, basicAuth())
                // The gateway's own idempotency, so a retry after a timeout
                // cannot send the money twice.
                .header("X-Razorpay-Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountPaise, "speed", "normal"))
                .retrieve()
                .body(JsonNode.class);

        if (response == null || response.path("id").asString("").isBlank()) {
            throw new BusinessException("REFUND_FAILED", "The refund could not be sent. Nothing has been taken.");
        }
        return response.path("id").asString();
    }

    /**
     * What the gateway itself says about an order.
     *
     * <p>Asked when the app polls a top-up, so a webhook that is late, lost, or
     * cannot reach us at all is not the only route to a credit. This is the
     * gateway answering about its own order — not a client claim — so it is
     * safe to credit from.
     *
     * @return the payment on that order, or empty when there is none yet
     */
    public Optional<OrderPayment> findPaymentForOrder(String providerOrderId) {
        requireConfigured();
        JsonNode response = restClient.get()
                .uri(properties.getRazorpay().getBaseUrl() + "/orders/" + providerOrderId + "/payments")
                .header(HttpHeaders.AUTHORIZATION, basicAuth())
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            return Optional.empty();
        }

        // Newest first: a retried checkout can leave several attempts on one
        // order, and the last word is the one that matters.
        JsonNode items = response.path("items");
        for (int index = items.size() - 1; index >= 0; index--) {
            JsonNode payment = items.get(index);
            String status = payment.path("status").asString("");
            if ("captured".equals(status) || "authorized".equals(status)) {
                return Optional.of(new OrderPayment(
                        payment.path("id").asString(""),
                        payment.path("amount").asLong(0L),
                        status));
            }
        }
        return Optional.empty();
    }

    /** One payment on an order, as the gateway describes it. */
    public record OrderPayment(String paymentId, long amountPaise, String status) {

        public boolean isCaptured() {
            return "captured".equals(status);
        }
    }

    /**
     * Whether this webhook really came from Razorpay.
     *
     * <p>Computed over the RAW body. Re-serialising parsed JSON changes bytes
     * and would fail every time, so the controller hands the string through
     * untouched.
     */
    public boolean signatureValid(String rawBody, String signature) {
        String secret = properties.getRazorpay().getWebhookSecret();
        if (secret == null || secret.isBlank()) {
            log.error("Service balance webhook rejected: no webhook secret configured");
            return false;
        }
        if (rawBody == null || signature == null || signature.isBlank()) {
            return false;
        }
        return constantTimeEquals(hmacSha256(rawBody, secret), signature);
    }

    private void requireConfigured() {
        if (!properties.getRazorpay().isConfigured()) {
            throw new BusinessException("TOP_UP_UNAVAILABLE", "Payments are not set up yet. Please try again later.");
        }
    }

    private String basicAuth() {
        String raw = properties.getRazorpay().getKeyId() + ":" + properties.getRazorpay().getKeySecret();
        return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private String hmacSha256(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new BusinessException("WEBHOOK_SIGNATURE_UNVERIFIABLE", "Could not verify the payment signature");
        }
    }

    /** Length-independent compare, so a timing attack learns nothing. */
    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
