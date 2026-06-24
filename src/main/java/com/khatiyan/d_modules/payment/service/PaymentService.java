package com.khatiyan.d_modules.payment.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.payment.api.dto.CreatePaymentOrderRequest;
import com.khatiyan.d_modules.payment.api.dto.PaymentOrderResponse;
import com.khatiyan.d_modules.payment.api.dto.PaymentWebhookEventResponse;
import com.khatiyan.d_modules.payment.api.dto.RecordClientPaymentFailureRequest;
import com.khatiyan.d_modules.payment.api.dto.VerifyProviderPaymentRequest;
import com.khatiyan.d_modules.payment.event.PaymentFailedEvent;
import com.khatiyan.d_modules.payment.event.PaymentSucceededEvent;
import com.khatiyan.d_modules.payment.model.PaymentIdempotencyKey;
import com.khatiyan.d_modules.payment.model.PaymentIdempotencyStatus;
import com.khatiyan.d_modules.payment.model.PaymentMethod;
import com.khatiyan.d_modules.payment.model.PaymentOrder;
import com.khatiyan.d_modules.payment.model.PaymentOrderStatus;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentTransaction;
import com.khatiyan.d_modules.payment.model.PaymentWebhookEvent;
import com.khatiyan.d_modules.payment.provider.CreateProviderPaymentOrderCommand;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderRegistry;
import com.khatiyan.d_modules.payment.provider.PaymentProviderUnavailableException;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentOrder;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentVerification;
import com.khatiyan.d_modules.payment.provider.ProviderWebhookVerification;
import com.khatiyan.d_modules.payment.provider.VerifyProviderPaymentCommand;
import com.khatiyan.d_modules.payment.repository.PaymentIdempotencyKeyRepository;
import com.khatiyan.d_modules.payment.repository.PaymentOrderRepository;
import com.khatiyan.d_modules.payment.repository.PaymentTransactionRepository;
import com.khatiyan.d_modules.payment.repository.PaymentWebhookEventRepository;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

import lombok.extern.slf4j.Slf4j;

/**
 * Coordinates payment order creation and payment confirmation.
 *
 * <p>
 * This service owns the internal payment state. Provider implementations only
 * talk to external gateways; they do not decide what amount is payable or which
 * billing cycle can be paid.
 */
@Slf4j
@Service
public class PaymentService {

    private static final String CREATE_PAYMENT_ORDER_OPERATION = "CREATE_PAYMENT_ORDER";

    private final PaymentOrderRepository paymentOrderRepository;
    private final PaymentTransactionRepository paymentTransactionRepository;
    private final PaymentWebhookEventRepository paymentWebhookEventRepository;
    private final PaymentIdempotencyKeyRepository idempotencyKeyRepository;
    private final PaymentProviderRegistry paymentProviderRegistry;
    private final PaymentProperties paymentProperties;
    private final BillingModule billingModule;
    private final ApplicationEventPublisher eventPublisher;
    private final ReferenceCodeGenerator referenceCodeGenerator;

    public PaymentService(
            PaymentOrderRepository paymentOrderRepository,
            PaymentTransactionRepository paymentTransactionRepository,
            PaymentWebhookEventRepository paymentWebhookEventRepository,
            PaymentIdempotencyKeyRepository idempotencyKeyRepository,
            PaymentProviderRegistry paymentProviderRegistry,
            PaymentProperties paymentProperties,
            BillingModule billingModule,
            ApplicationEventPublisher eventPublisher,
            ReferenceCodeGenerator referenceCodeGenerator) {
        this.paymentOrderRepository = paymentOrderRepository;
        this.paymentTransactionRepository = paymentTransactionRepository;
        this.paymentWebhookEventRepository = paymentWebhookEventRepository;
        this.idempotencyKeyRepository = idempotencyKeyRepository;
        this.paymentProviderRegistry = paymentProviderRegistry;
        this.paymentProperties = paymentProperties;
        this.billingModule = billingModule;
        this.eventPublisher = eventPublisher;
        this.referenceCodeGenerator = referenceCodeGenerator;
    }

    /**
     * Creates or reuses an active provider checkout order for a tenant billing cycle.
     */
    @Transactional(noRollbackFor = ValidationException.class)
    public PaymentOrderResponse createOrderForBillingCycle(
            UUID tenantUserId,
            UUID billingCycleId,
            CreatePaymentOrderRequest request) {
        Instant now = Instant.now();
        BillingCycleResponse cycle = billingModule.getMyCycle(tenantUserId, billingCycleId);

        validatePayableCycle(cycle);

        PaymentProviderType providerType = request.resolvedProvider(paymentProperties.defaultProvider());
        PaymentProvider provider = paymentProviderRegistry.get(providerType);
        String idempotencyKey = requireIdempotencyKey(request);
        String requestHash = createOrderRequestHash(
                tenantUserId,
                billingCycleId,
                providerType,
                cycle.totalAmountPaise(),
                paymentProperties.currency());
        IdempotencyClaim idempotencyClaim = claimOrLoadIdempotencyRecord(
                tenantUserId,
                idempotencyKey,
                requestHash,
                now);
        PaymentIdempotencyKey idempotencyRecord = idempotencyClaim.record();

        if (!idempotencyClaim.claimedByCurrentRequest()) {
            return replayExistingIdempotentResult(idempotencyRecord);
        }

        if (idempotencyRecord.getStatus() == PaymentIdempotencyStatus.COMPLETED) {
            PaymentOrder existingOrder = paymentOrderRepository.findById(idempotencyRecord.getPaymentOrderId())
                    .orElseThrow(() -> new ValidationException("Idempotent payment order is missing"));

            return PaymentOrderResponse.from(existingOrder);
        }

        if (idempotencyRecord.getStatus() == PaymentIdempotencyStatus.FAILED) {
            throw new ValidationException("Previous payment order request failed. Use a new idempotency key.");
        }

        expireOldOpenOrders(billingCycleId, cycle.totalAmountPaise(), now);

        Optional<PaymentOrder> existingOrder = findOpenOrder(billingCycleId, cycle.totalAmountPaise(), now);
        if (existingOrder.isPresent()) {
            idempotencyRecord.markCompleted(existingOrder.get().getId(), now);
            return PaymentOrderResponse.from(existingOrder.get());
        }

        PaymentOrder order = PaymentOrder.create(
                cycle.id(),
                referenceCodeGenerator.nextCode("PAY"),
                cycle.tenancyId(),
                cycle.tenantUserId(),
                cycle.propertyId(),
                cycle.totalAmountPaise(),
                paymentProperties.currency(),
                providerType,
                tenantUserId,
                now.plus(Duration.ofMinutes(paymentProperties.orderExpiryMinutes())));

        PaymentOrder savedOrder = paymentOrderRepository.save(order);

        try {
            ProviderPaymentOrder providerOrder = provider.createOrder(toProviderCommand(savedOrder, cycle));
            savedOrder.attachProviderOrder(
                    providerOrder.providerOrderId(),
                    providerOrder.checkoutReference());
            idempotencyRecord.markCompleted(savedOrder.getId(), now);
        } catch (PaymentProviderUnavailableException exception) {
            idempotencyRecord.markFailed(exception.getMessage(), now);
            savedOrder.markFailed(exception.getMessage(), now);
            throw exception;
        } catch (RuntimeException exception) {
            idempotencyRecord.markFailed(exception.getMessage(), now);
            savedOrder.markFailed(exception.getMessage(), now);
            throw new ValidationException("Payment provider order creation failed");
        }

        log.info(
                "Payment order created paymentOrderId={} billingCycleId={} tenantUserId={} provider={} amount={}",
                savedOrder.getId(),
                billingCycleId,
                tenantUserId,
                providerType,
                savedOrder.getAmountPaise());

        return PaymentOrderResponse.from(savedOrder);
    }

    /**
     * Confirms a successful frontend checkout return after Razorpay signature
     * verification.
     *
     * <p>
     * This gives the user instant feedback after checkout. Webhooks still remain
     * the safety net if the browser callback never reaches us.
     */
    @Transactional
    public PaymentOrderResponse verifyCheckoutReturn(
            UUID tenantUserId,
            VerifyProviderPaymentRequest request) {
        PaymentOrder order = findVerifiedOrder(request);

        if (!order.getTenantUserId().equals(tenantUserId)) {
            throw new ForbiddenException("You cannot verify this payment order");
        }

        return completeVerifiedOrder(order, request);
    }

    @Transactional
    public PaymentOrderResponse verifyCheckoutReturnPublic(VerifyProviderPaymentRequest request) {
        PaymentOrder order = findVerifiedOrder(request);
        return completeVerifiedOrder(order, request);
    }

    @Transactional(readOnly = true)
    public PaymentOrderResponse getCheckoutOrder(UUID paymentOrderId) {
        PaymentOrder order = paymentOrderRepository.findById(paymentOrderId)
                .orElseThrow(() -> new NotFoundException("PaymentOrder", paymentOrderId));
        return PaymentOrderResponse.from(order);
    }

    private PaymentOrder findVerifiedOrder(VerifyProviderPaymentRequest request) {
        PaymentProviderType providerType = PaymentProviderType.RAZORPAY;
        return paymentOrderRepository
                .findByProviderOrderId(providerType, request.providerOrderId())
                .orElseThrow(() -> new NotFoundException("PaymentOrder", request.providerOrderId()));
    }

    private PaymentOrderResponse completeVerifiedOrder(PaymentOrder order, VerifyProviderPaymentRequest request) {
        PaymentProviderType providerType = PaymentProviderType.RAZORPAY;
        PaymentProvider provider = paymentProviderRegistry.get(providerType);
        ProviderPaymentVerification verification = provider.verifyReturnPayload(
                new VerifyProviderPaymentCommand(
                        request.providerOrderId(),
                        request.providerPaymentId(),
                        request.signature()));

        if (!verification.valid()) {
            throw new ValidationException(verification.failureReason());
        }

        return completeSuccessfulPayment(
                order,
                verification.providerPaymentId(),
                order.getAmountPaise(),
                order.getCurrency(),
                verification.method(),
                verification.providerStatus(),
                verification.paidAt() != null ? verification.paidAt() : Instant.now());
    }

    /**
     * Stores and processes Razorpay webhooks.
     *
     * <p>
     * Razorpay may retry the same event. We dedupe first by event id when present,
     * and then by payload hash, so repeated delivery cannot mark the same cycle
     * paid twice.
     */
    @Transactional(noRollbackFor = ValidationException.class)
    public PaymentWebhookEventResponse handleRazorpayWebhook(
            String payloadJson,
            String signature,
            String providerEventIdHeader) {
        PaymentProviderType providerType = PaymentProviderType.RAZORPAY;
        PaymentProvider provider = paymentProviderRegistry.get(providerType);
        ProviderWebhookVerification verification = provider.verifyWebhook(payloadJson, signature);
        String providerEventId = firstPresent(verification.providerEventId(), providerEventIdHeader);
        String payloadSha256 = sha256Hex(payloadJson);

        Optional<PaymentWebhookEvent> existingEvent = findExistingWebhookEvent(
                providerType,
                providerEventId,
                payloadSha256);
        if (existingEvent.isPresent()) {
            return PaymentWebhookEventResponse.from(existingEvent.get());
        }

        PaymentWebhookEvent event = PaymentWebhookEvent.received(
                providerType,
                providerEventId,
                verification.eventType() != null ? verification.eventType() : "UNKNOWN",
                verification.providerOrderId(),
                verification.providerPaymentId(),
                payloadSha256,
                payloadJson,
                signature,
                verification.signatureValid());

        paymentWebhookEventRepository.save(event);

        if (!verification.signatureValid()) {
            event.markFailed("Invalid Razorpay webhook signature", Instant.now());
            return PaymentWebhookEventResponse.from(event);
        }

        if (!isSupportedWebhookEvent(verification)) {
            event.markIgnored("Webhook event is not payment captured/failed", Instant.now());
            return PaymentWebhookEventResponse.from(event);
        }

        PaymentOrder order = paymentOrderRepository
                .findByProviderOrderId(providerType, verification.providerOrderId())
                .orElse(null);
        if (order == null) {
            event.markFailed("Payment order not found for provider order id", Instant.now());
            return PaymentWebhookEventResponse.from(event);
        }

        if (isFailedWebhookEvent(verification)) {
            recordFailedProviderPayment(order, verification);
            event.markProcessed(Instant.now());
            return PaymentWebhookEventResponse.from(event);
        }

        completeSuccessfulPayment(
                order,
                verification.providerPaymentId(),
                verification.amountPaise(),
                verification.currency(),
                verification.method(),
                verification.providerStatus(),
                verification.paidAt() != null ? verification.paidAt() : Instant.now());

        event.markProcessed(Instant.now());
        return PaymentWebhookEventResponse.from(event);
    }

    /**
     * Records a failure observed by the browser checkout widget.
     *
     * <p>
     * This is intentionally not the source of truth for money movement. It only
     * stores a failed attempt and marks the current checkout order failed so the
     * tenant can create a fresh order for retry.
     */
    @Transactional
    public PaymentOrderResponse recordClientPaymentFailure(
            UUID tenantUserId,
            UUID paymentOrderId,
            RecordClientPaymentFailureRequest request) {
        PaymentOrder order = paymentOrderRepository.findById(paymentOrderId)
                .orElseThrow(() -> new NotFoundException("PaymentOrder", paymentOrderId));

        if (!order.getTenantUserId().equals(tenantUserId)) {
            throw new ForbiddenException("You cannot update this payment order");
        }

        if (order.getStatus() == PaymentOrderStatus.PAID) {
            return PaymentOrderResponse.from(order);
        }

        if (request.providerOrderId() != null
                && !request.providerOrderId().isBlank()
                && order.getProviderOrderId() != null
                && !order.getProviderOrderId().equals(request.providerOrderId())) {
            throw new ValidationException("Provider order id does not match payment order");
        }

        if (request.providerPaymentId() != null && !request.providerPaymentId().isBlank()) {
            Optional<PaymentTransaction> existingTransaction = paymentTransactionRepository
                    .findByProviderPaymentId(order.getProvider(), request.providerPaymentId());
            if (existingTransaction.isPresent()) {
                boolean alreadyFailed = order.getStatus() == PaymentOrderStatus.FAILED;
                order.markFailed(clientFailureMessage(request), Instant.now());
                if (!alreadyFailed) {
                    publishPaymentFailedEvent(order, clientFailureMessage(request));
                }
                return PaymentOrderResponse.from(order);
            }
        }

        PaymentTransaction transaction = PaymentTransaction.failed(
                order.getId(),
                order.getProvider(),
                order.getProviderOrderId(),
                request.providerPaymentId(),
                order.getAmountPaise(),
                order.getCurrency(),
                PaymentMethod.UNKNOWN,
                "CLIENT_REPORTED_FAILED",
                request.errorCode(),
                clientFailureMessage(request));

        paymentTransactionRepository.save(transaction);
        boolean alreadyFailed = order.getStatus() == PaymentOrderStatus.FAILED;
        order.markFailed(clientFailureMessage(request), Instant.now());
        if (!alreadyFailed) {
            publishPaymentFailedEvent(order, clientFailureMessage(request));
        }

        log.info(
                "Client payment failure recorded paymentOrderId={} providerOrderId={} providerPaymentId={} code={} reason={}",
                order.getId(),
                order.getProviderOrderId(),
                request.providerPaymentId(),
                request.errorCode(),
                request.errorReason());

        return PaymentOrderResponse.from(order);
    }

    private String requireIdempotencyKey(CreatePaymentOrderRequest request) {
        String idempotencyKey = request.normalizedIdempotencyKey();
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ValidationException("Idempotency key is required");
        }
        if (idempotencyKey.length() > 120) {
            throw new ValidationException("Idempotency key must be 120 characters or less");
        }

        return idempotencyKey;
    }

    private IdempotencyClaim claimOrLoadIdempotencyRecord(
            UUID tenantUserId,
            String idempotencyKey,
            String requestHash,
            Instant now) {
        int insertedCount = idempotencyKeyRepository.insertProcessingClaim(
                UUID.randomUUID(),
                tenantUserId,
                CREATE_PAYMENT_ORDER_OPERATION,
                idempotencyKey,
                requestHash,
                now);

        PaymentIdempotencyKey record = idempotencyKeyRepository.findByUserOperationAndKey(
                tenantUserId,
                CREATE_PAYMENT_ORDER_OPERATION,
                idempotencyKey)
                .orElseThrow(() -> new ValidationException("Idempotency key could not be loaded"));

        record.assertSameRequest(requestHash);

        return new IdempotencyClaim(record, insertedCount == 1);
    }

    private PaymentOrderResponse replayExistingIdempotentResult(PaymentIdempotencyKey record) {
        if (record.getStatus() == PaymentIdempotencyStatus.COMPLETED) {
            PaymentOrder existingOrder = paymentOrderRepository.findById(record.getPaymentOrderId())
                    .orElseThrow(() -> new ValidationException("Idempotent payment order is missing"));

            if (existingOrder.getStatus() == PaymentOrderStatus.FAILED
                    || existingOrder.getStatus() == PaymentOrderStatus.EXPIRED) {
                throw new ValidationException("Previous payment order is no longer usable. Use a new idempotency key.");
            }

            return PaymentOrderResponse.from(existingOrder);
        }

        if (record.getStatus() == PaymentIdempotencyStatus.PROCESSING) {
            throw new ValidationException("Payment order request is already processing. Retry shortly.");
        }

        throw new ValidationException("Previous payment order request failed. Use a new idempotency key.");
    }

    private PaymentOrderResponse completeSuccessfulPayment(
            PaymentOrder order,
            String providerPaymentId,
            Long amountPaise,
            String currency,
            PaymentMethod method,
            String providerStatus,
            Instant paidAt) {
        validateProviderPaymentMatchesOrder(order, amountPaise, currency);

        if (providerPaymentId != null && !providerPaymentId.isBlank()) {
            Optional<PaymentTransaction> existingTransaction = paymentTransactionRepository
                    .findByProviderPaymentId(order.getProvider(), providerPaymentId);
            if (existingTransaction.isEmpty()) {
                PaymentTransaction transaction = PaymentTransaction.successful(
                        order.getId(),
                        order.getProvider(),
                        order.getProviderOrderId(),
                        providerPaymentId,
                        order.getAmountPaise(),
                        order.getCurrency(),
                        method != null ? method : PaymentMethod.UNKNOWN,
                        providerStatus != null ? providerStatus : "verified",
                        paidAt);

                paymentTransactionRepository.save(transaction);
            }
        }

        if (order.getStatus() != PaymentOrderStatus.PAID) {
            order.markPaid(paidAt);
            billingModule.recordMyPaymentSuccess(
                    order.getTenantUserId(),
                    order.getBillingCycleId(),
                    order.getAmountPaise());
            publishPaymentSucceededEvent(order, providerPaymentId);
        }

        log.info(
                "Payment completed paymentOrderId={} providerOrderId={} providerPaymentId={} billingCycleId={} amount={}",
                order.getId(),
                order.getProviderOrderId(),
                providerPaymentId,
                order.getBillingCycleId(),
                order.getAmountPaise());

        return PaymentOrderResponse.from(order);
    }

    private Optional<PaymentWebhookEvent> findExistingWebhookEvent(
            PaymentProviderType providerType,
            String providerEventId,
            String payloadSha256) {
        if (providerEventId != null && !providerEventId.isBlank()) {
            Optional<PaymentWebhookEvent> event = paymentWebhookEventRepository
                    .findByProviderEventId(providerType, providerEventId);
            if (event.isPresent()) {
                return event;
            }
        }

        return paymentWebhookEventRepository.findByPayloadSha256(providerType, payloadSha256);
    }

    private boolean isSupportedWebhookEvent(ProviderWebhookVerification verification) {
        return isSuccessfulWebhookEvent(verification) || isFailedWebhookEvent(verification);
    }

    private boolean isSuccessfulWebhookEvent(ProviderWebhookVerification verification) {
        return "payment.captured".equals(verification.eventType())
                || "captured".equalsIgnoreCase(verification.providerStatus());
    }

    private boolean isFailedWebhookEvent(ProviderWebhookVerification verification) {
        return "payment.failed".equals(verification.eventType())
                || "failed".equalsIgnoreCase(verification.providerStatus());
    }

    private void validateProviderPaymentMatchesOrder(PaymentOrder order, Long amountPaise, String currency) {
        if (amountPaise != null && amountPaise != order.getAmountPaise()) {
            throw new ValidationException("Provider payment amount does not match payment order");
        }

        if (currency != null && !currency.isBlank() && !order.getCurrency().equalsIgnoreCase(currency)) {
            throw new ValidationException("Provider payment currency does not match payment order");
        }
    }

    private void recordFailedProviderPayment(
            PaymentOrder order,
            ProviderWebhookVerification verification) {
        if (verification.providerPaymentId() != null && !verification.providerPaymentId().isBlank()) {
            Optional<PaymentTransaction> existingTransaction = paymentTransactionRepository
                    .findByProviderPaymentId(order.getProvider(), verification.providerPaymentId());
            if (existingTransaction.isPresent()) {
                return;
            }
        }

        PaymentTransaction transaction = PaymentTransaction.failed(
                order.getId(),
                order.getProvider(),
                order.getProviderOrderId(),
                verification.providerPaymentId(),
                order.getAmountPaise(),
                order.getCurrency(),
                verification.method() != null ? verification.method() : PaymentMethod.UNKNOWN,
                verification.providerStatus(),
                verification.failureCode(),
                verification.failureReason());

        paymentTransactionRepository.save(transaction);
        if (order.getStatus() != PaymentOrderStatus.PAID) {
            boolean alreadyFailed = order.getStatus() == PaymentOrderStatus.FAILED;
            order.markFailed(verification.failureReason(), Instant.now());
            if (!alreadyFailed) {
                publishPaymentFailedEvent(order, verification.failureReason());
            }
        }
    }

    private String clientFailureMessage(RecordClientPaymentFailureRequest request) {
        StringBuilder message = new StringBuilder("Client checkout failure");
        if (request.errorDescription() != null && !request.errorDescription().isBlank()) {
            message.append(": ").append(request.errorDescription());
        }
        if (request.errorReason() != null && !request.errorReason().isBlank()) {
            message.append(" [").append(request.errorReason()).append("]");
        }

        return message.toString();
    }

    private String firstPresent(String firstValue, String secondValue) {
        if (firstValue != null && !firstValue.isBlank()) {
            return firstValue;
        }

        return secondValue;
    }

    private void validatePayableCycle(BillingCycleResponse cycle) {
        if (cycle.status() != BillingCycleStatus.UNPAID && cycle.status() != BillingCycleStatus.OVERDUE) {
            throw new ValidationException("Only unpaid or overdue billing cycles can be paid");
        }

        if (cycle.totalAmountPaise() <= 0) {
            throw new ValidationException("Billing cycle payable amount must be positive");
        }

        ensureFirstCycleDepositCanBeOpened(cycle);
    }

    private void ensureFirstCycleDepositCanBeOpened(BillingCycleResponse cycle) {
        if (cycle.billingType() != TenancyBillingType.MONTHLY || cycle.cycleNumber() != 1) {
            return;
        }

        long depositAmountPaise = 0;
        for (var lineItem : cycle.lineItems()) {
            if (lineItem.type() == BillingCycleLineItemType.DEPOSIT) {
                depositAmountPaise = depositAmountPaise + lineItem.amountPaise();
            }
        }

        if (depositAmountPaise <= 0) {
            return;
        }

        if (cycle.totalAmountPaise() < depositAmountPaise) {
            throw new ValidationException("First billing cycle payable amount cannot be less than deposit amount");
        }
    }

    private Optional<PaymentOrder> findOpenOrder(UUID billingCycleId, long currentAmountPaise, Instant now) {
        return paymentOrderRepository.findByBillingCycleIdAndStatuses(
                billingCycleId,
                List.of(PaymentOrderStatus.CREATED, PaymentOrderStatus.ATTEMPTED))
                .stream()
                .filter(order -> order.getExpiresAt() == null || order.getExpiresAt().isAfter(now))
                .filter(order -> order.getAmountPaise() == currentAmountPaise)
                .findFirst();
    }

    private void expireOldOpenOrders(UUID billingCycleId, long currentAmountPaise, Instant now) {
        List<PaymentOrder> openOrders = paymentOrderRepository.findByBillingCycleIdAndStatuses(
                billingCycleId,
                List.of(PaymentOrderStatus.CREATED, PaymentOrderStatus.ATTEMPTED));

        for (PaymentOrder order : openOrders) {
            if (order.getExpiresAt() != null && !order.getExpiresAt().isAfter(now)) {
                order.expire(now);
                continue;
            }

            if (order.getAmountPaise() != currentAmountPaise) {
                order.expire(now);
            }
        }
    }

    private CreateProviderPaymentOrderCommand toProviderCommand(
            PaymentOrder order,
            BillingCycleResponse cycle) {
        return new CreateProviderPaymentOrderCommand(
                order.getId(),
                order.getBillingCycleId(),
                order.getTenancyId(),
                order.getTenantUserId(),
                order.getPropertyId(),
                order.getAmountPaise(),
                order.getCurrency(),
                receiptReference(order),
                description(cycle));
    }

    private String receiptReference(PaymentOrder order) {
        return "kht_" + order.getId().toString().replace("-", "");
    }

    private String description(BillingCycleResponse cycle) {
        return "Khatiyan billing cycle " + cycle.cycleNumber();
    }

    private String createOrderRequestHash(
            UUID tenantUserId,
            UUID billingCycleId,
            PaymentProviderType providerType,
            long amountPaise,
            String currency) {
        String rawValue = CREATE_PAYMENT_ORDER_OPERATION
                + "|tenantUserId=" + tenantUserId
                + "|billingCycleId=" + billingCycleId
                + "|provider=" + providerType
                + "|amountPaise=" + amountPaise
                + "|currency=" + currency;

        return sha256Hex(rawValue);
    }

    private String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                hex.append(String.format("%02x", item));
            }

            return hex.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private void publishPaymentSucceededEvent(PaymentOrder order, String providerPaymentId) {
        eventPublisher.publishEvent(new PaymentSucceededEvent(
                order.getId(),
                order.getBillingCycleId(),
                order.getTenancyId(),
                order.getTenantUserId(),
                order.getPropertyId(),
                order.getAmountPaise(),
                order.getCurrency(),
                providerPaymentId));
    }


    private void publishPaymentFailedEvent(PaymentOrder order, String failureReason) {
        eventPublisher.publishEvent(new PaymentFailedEvent(
                order.getId(),
                order.getBillingCycleId(),
                order.getTenancyId(),
                order.getTenantUserId(),
                order.getPropertyId(),
                order.getAmountPaise(),
                order.getCurrency(),
                failureReason));
    }

    private record IdempotencyClaim(
            PaymentIdempotencyKey record,
            boolean claimedByCurrentRequest) {
    }
}
