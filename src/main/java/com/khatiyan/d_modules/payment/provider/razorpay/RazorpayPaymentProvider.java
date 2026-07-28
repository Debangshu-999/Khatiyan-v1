package com.khatiyan.d_modules.payment.provider.razorpay;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.json.JSONObject;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.payment.model.PaymentMethod;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.provider.CreateLinkedAccountCommand;
import com.khatiyan.d_modules.payment.provider.CreateProviderTransferCommand;
import com.khatiyan.d_modules.payment.provider.CreateProviderPaymentOrderCommand;
import com.khatiyan.d_modules.payment.provider.LinkedAccountResult;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderUnavailableException;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentDetails;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentOrder;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentVerification;
import com.khatiyan.d_modules.payment.provider.ProviderRefund;
import com.khatiyan.d_modules.payment.provider.ProviderTransfer;
import com.khatiyan.d_modules.payment.provider.ProviderWebhookTransfer;
import com.khatiyan.d_modules.payment.provider.ProviderWebhookVerification;
import com.khatiyan.d_modules.payment.provider.VerifyProviderPaymentCommand;
import com.razorpay.Account;
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

            // No "transfers" here on purpose. Declaring the split on the order
            // would force us to guess the gateway fee before the tenant has even
            // chosen a payment method — and the real cost differs enormously
            // between UPI (free) and cards. The transfer is created after
            // capture instead, from the fee Razorpay actually charged.

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

    /**
     * Onboards an owner as a Route linked account. Razorpay needs three calls,
     * in order, and the account is only payable once the third one activates:
     *
     * <ol>
     *   <li>create the account (business identity + PAN)</li>
     *   <li>add the stakeholder (the human behind it, PAN again for KYC)</li>
     *   <li>request the {@code route} product with the settlement bank details</li>
     * </ol>
     *
     * <p>A failure at step 2 or 3 still leaves a usable account id, so it is
     * returned as PENDING rather than discarded — dropping it would orphan a
     * real Razorpay account and create a second one on the next attempt.
     */
    @Override
    public LinkedAccountResult createLinkedAccount(CreateLinkedAccountCommand command) {
        validateKeysConfigured();

        String accountId = null;
        try {
            RazorpayClient client = new RazorpayClient(properties.keyId(), properties.keySecret());

            Account account = client.account.create(accountRequest(command));
            accountId = account.get("id");

            client.stakeholder.create(accountId, stakeholderRequest(command));

            Account product = client.product.requestProductConfiguration(accountId, productRequest(command));
            String activationStatus = product.has("activation_status") ? product.get("activation_status") : null;

            log.info("Owner linked account created ownerUserId={} accountId={} activationStatus={}",
                    command.ownerUserId(), accountId, activationStatus);

            // Razorpay validates the bank account within about a minute, so this
            // is usually already decided by the time we read it.
            if ("activated".equalsIgnoreCase(activationStatus)) {
                return LinkedAccountResult.active(accountId);
            }
            if ("needs_clarification".equalsIgnoreCase(activationStatus)
                    || "rejected".equalsIgnoreCase(activationStatus)) {
                return LinkedAccountResult.failed(
                        "The bank could not verify these details. Please check them and save again.");
            }
            return LinkedAccountResult.pending(accountId);
        } catch (RazorpayException exception) {
            log.error("Owner linked account onboarding failed ownerUserId={} accountId={}",
                    command.ownerUserId(), accountId, exception);
            if (accountId != null) {
                // Keep the id: the account exists at Razorpay even though the
                // rest of onboarding did not finish.
                return LinkedAccountResult.pending(accountId);
            }
            return LinkedAccountResult.failed("Could not reach the payment partner. Please try again shortly.");
        }
    }

    private JSONObject accountRequest(CreateLinkedAccountCommand command) {
        JSONObject request = new JSONObject();
        request.put("email", command.email());
        request.put("phone", command.phone());
        request.put("type", "route");
        request.put("legal_business_name", command.accountHolderName());
        request.put("business_type", businessTypeFor(command.pan()));

        JSONObject registered = new JSONObject();
        registered.put("street1", command.street());
        registered.put("street2", "");
        registered.put("city", command.city());
        registered.put("state", command.state());
        registered.put("postal_code", command.postalCode());
        registered.put("country", "IN");

        JSONObject addresses = new JSONObject();
        addresses.put("registered", registered);

        JSONObject profile = new JSONObject();
        profile.put("category", "housing");
        // A PG owner lets out beds; the sibling values describe builders, RWAs,
        // coworking operators and listing portals, none of which is our owner.
        profile.put("subcategory", "space_rental");
        profile.put("addresses", addresses);
        request.put("profile", profile);

        JSONObject legalInfo = new JSONObject();
        legalInfo.put("pan", command.pan());
        request.put("legal_info", legalInfo);

        return request;
    }

    private JSONObject stakeholderRequest(CreateLinkedAccountCommand command) {
        JSONObject kyc = new JSONObject();
        kyc.put("pan", command.pan());

        JSONObject request = new JSONObject();
        // Razorpay requires this to match the PAN card exactly.
        request.put("name", command.accountHolderName());
        request.put("email", command.email());
        request.put("kyc", kyc);

        return request;
    }

    private JSONObject productRequest(CreateLinkedAccountCommand command) {
        JSONObject bankAccount = new JSONObject();
        bankAccount.put("account_number", command.accountNumber());
        bankAccount.put("ifsc_code", command.ifsc());
        bankAccount.put("beneficiary_name", command.accountHolderName());

        JSONObject settlements = new JSONObject();
        settlements.put("account_number", command.accountNumber());
        settlements.put("ifsc_code", command.ifsc());
        settlements.put("beneficiary_name", command.accountHolderName());

        JSONObject request = new JSONObject();
        request.put("product_name", "route");
        request.put("tnc_accepted", true);
        request.put("settlements", settlements);

        return request;
    }

    /**
     * Maps the PAN's 4th character to Razorpay's business type. It encodes the
     * holder category, so the owner never has to be asked — and it is the same
     * signal the TDS threshold rule turns on.
     */
    private String businessTypeFor(String pan) {
        if (pan == null || pan.length() != 10) {
            return "individual";
        }

        return switch (Character.toUpperCase(pan.charAt(3))) {
            case 'C' -> "private_limited";
            case 'H' -> "huf";
            case 'F' -> "partnership";
            case 'T' -> "trust";
            case 'A' -> "society";
            case 'G' -> "government";
            case 'L' -> "llp";
            default -> "individual";
        };
    }

    @Override
    public ProviderPaymentDetails fetchPayment(String providerPaymentId) {
        validateKeysConfigured();

        try {
            RazorpayClient client = new RazorpayClient(properties.keyId(), properties.keySecret());
            com.razorpay.Payment payment = client.payments.fetch(providerPaymentId);

            long amount = payment.has("amount") ? ((Number) payment.get("amount")).longValue() : 0L;
            String currency = payment.has("currency") ? payment.get("currency") : null;
            String method = payment.has("method") ? payment.get("method") : null;
            String status = payment.has("status") ? payment.get("status") : null;

            // Razorpay populates fee/tax once the payment is settled-for-fee.
            // Absent or null means "not published yet", which must not be read
            // as "free" — the caller defers instead of assuming.
            boolean feeKnown = payment.has("fee") && payment.get("fee") != null;
            if (!feeKnown) {
                return ProviderPaymentDetails.feeUnavailable(providerPaymentId, amount, currency, method, status);
            }

            long fee = ((Number) payment.get("fee")).longValue();
            long tax = payment.has("tax") && payment.get("tax") != null
                    ? ((Number) payment.get("tax")).longValue()
                    : 0L;

            return new ProviderPaymentDetails(providerPaymentId, amount, currency, method, status, true, fee, tax);
        } catch (RazorpayException exception) {
            throw new PaymentProviderUnavailableException("Could not read the payment from the gateway.");
        }
    }

    @Override
    public ProviderTransfer createTransfer(CreateProviderTransferCommand command) {
        validateKeysConfigured();

        try {
            RazorpayClient client = new RazorpayClient(properties.keyId(), properties.keySecret());

            JSONObject transfer = new JSONObject();
            transfer.put("account", command.linkedAccountRef());
            transfer.put("amount", command.amountPaise());
            transfer.put("currency", command.currency());
            transfer.put("on_hold", false);

            JSONObject transferNotes = new JSONObject();
            transferNotes.put("paymentOrderId", command.paymentOrderId().toString());
            transferNotes.put("billingCycleId", command.billingCycleId().toString());
            transfer.put("notes", transferNotes);

            // The API splits a payment across many accounts, so it takes an array
            // and answers with one. We only ever send a single owner's share.
            org.json.JSONArray transfers = new org.json.JSONArray();
            transfers.put(transfer);

            JSONObject request = new JSONObject();
            request.put("transfers", transfers);

            List<com.razorpay.Transfer> created = client.payments.transfer(command.providerPaymentId(), request);
            if (created == null || created.isEmpty()) {
                throw new PaymentProviderUnavailableException("The gateway accepted no transfer for this payment.");
            }

            com.razorpay.Transfer result = created.get(0);
            return new ProviderTransfer(
                    result.get("id"),
                    result.has("status") ? result.get("status") : null);
        } catch (RazorpayException exception) {
            throw new PaymentProviderUnavailableException("Could not transfer the owner's payout. It will be retried.");
        }
    }

    @Override
    public ProviderRefund refundPayment(String providerPaymentId, long amountPaise) {
        validateKeysConfigured();

        try {
            RazorpayClient client = new RazorpayClient(properties.keyId(), properties.keySecret());

            JSONObject request = new JSONObject();
            request.put("amount", amountPaise);
            // "normal" rather than "optimum": instant refunds carry an extra fee
            // and nothing here is urgent enough to justify charging for speed.
            request.put("speed", "normal");

            com.razorpay.Refund refund = client.payments.refund(providerPaymentId, request);
            return new ProviderRefund(
                    refund.get("id"),
                    refund.has("status") ? refund.get("status") : null);
        } catch (RazorpayException exception) {
            throw new PaymentProviderUnavailableException("Could not issue the refund. It will be retried.");
        }
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
                failureReason,
                transferEntity(payload));
    }

    /**
     * Lifts the transfer out of a Route webhook. {@code transfer.*} events carry
     * a transfer entity; {@code settlement.processed} carries a settlement whose
     * id we do not track, so only the transfer shape is extracted.
     */
    private ProviderWebhookTransfer transferEntity(JSONObject payload) {
        JSONObject payloadNode = payload.optJSONObject("payload");
        if (payloadNode == null) {
            return null;
        }

        JSONObject transferNode = payloadNode.optJSONObject("transfer");
        if (transferNode == null) {
            return null;
        }

        JSONObject entity = transferNode.optJSONObject("entity");
        if (entity == null) {
            return null;
        }

        String failureReason = null;
        JSONObject error = entity.optJSONObject("error");
        if (error != null) {
            failureReason = firstNonBlank(
                    error.optString("description", null),
                    error.optString("reason", null),
                    error.optString("code", null));
        }

        return new ProviderWebhookTransfer(
                entity.optString("id", null),
                entity.optString("status", null),
                failureReason);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
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
