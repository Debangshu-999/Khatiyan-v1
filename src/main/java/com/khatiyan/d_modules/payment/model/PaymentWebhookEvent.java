package com.khatiyan.d_modules.payment.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Raw provider webhook receipt.
 *
 * <p>Payment gateways retry webhooks and may deliver duplicate events.
 * This entity stores the payload, signature result, and processing state so
 * payment handling remains idempotent and auditable.
 */
@Entity
@Table(name = "payment_webhook_events", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentWebhookEvent extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentProviderType provider;

    @Column(name = "provider_event_id", length = 160)
    private String providerEventId;

    @Column(name = "event_type", nullable = false, length = 120)
    private String eventType;

    @Column(name = "provider_order_id", length = 120)
    private String providerOrderId;

    @Column(name = "provider_payment_id", length = 120)
    private String providerPaymentId;

    @Column(name = "payload_sha256", nullable = false, length = 64)
    private String payloadSha256;

    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson;

    @Column(length = 500)
    private String signature;

    @Column(name = "signature_valid", nullable = false)
    private boolean signatureValid;

    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status", nullable = false, length = 30)
    private PaymentWebhookProcessingStatus processingStatus;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    private PaymentWebhookEvent(
            PaymentProviderType provider,
            String providerEventId,
            String eventType,
            String providerOrderId,
            String providerPaymentId,
            String payloadSha256,
            String payloadJson,
            String signature,
            boolean signatureValid) {
        this.id = UUID.randomUUID();
        this.provider = provider;
        this.providerEventId = providerEventId;
        this.eventType = eventType;
        this.providerOrderId = providerOrderId;
        this.providerPaymentId = providerPaymentId;
        this.payloadSha256 = payloadSha256;
        this.payloadJson = payloadJson;
        this.signature = signature;
        this.signatureValid = signatureValid;
        this.processingStatus = PaymentWebhookProcessingStatus.RECEIVED;
    }

    public static PaymentWebhookEvent received(
            PaymentProviderType provider,
            String providerEventId,
            String eventType,
            String providerOrderId,
            String providerPaymentId,
            String payloadSha256,
            String payloadJson,
            String signature,
            boolean signatureValid) {
        return new PaymentWebhookEvent(
                provider,
                providerEventId,
                eventType,
                providerOrderId,
                providerPaymentId,
                payloadSha256,
                payloadJson,
                signature,
                signatureValid);
    }

    public void markProcessed(Instant processedAt) {
        this.processingStatus = PaymentWebhookProcessingStatus.PROCESSED;
        this.processedAt = processedAt;
        this.failureReason = null;
    }

    public void markIgnored(String reason, Instant processedAt) {
        this.processingStatus = PaymentWebhookProcessingStatus.IGNORED;
        this.processedAt = processedAt;
        this.failureReason = reason;
    }

    public void markFailed(String reason, Instant processedAt) {
        this.processingStatus = PaymentWebhookProcessingStatus.FAILED;
        this.processedAt = processedAt;
        this.failureReason = reason;
    }
}
