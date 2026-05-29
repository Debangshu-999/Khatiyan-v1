package com.khatiyan.d_modules.payment.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentWebhookEvent;
import com.khatiyan.d_modules.payment.model.PaymentWebhookProcessingStatus;

/**
 * API/debug response for stored provider webhooks.
 *
 * <p>This should generally be admin/internal only because it exposes provider
 * event metadata and processing details.
 */
public record PaymentWebhookEventResponse(
        UUID id,
        PaymentProviderType provider,
        String providerEventId,
        String eventType,
        String providerOrderId,
        String providerPaymentId,
        String payloadSha256,
        boolean signatureValid,
        PaymentWebhookProcessingStatus processingStatus,
        Instant processedAt,
        String failureReason,
        Instant createdAt,
        Instant updatedAt) {

    public static PaymentWebhookEventResponse from(PaymentWebhookEvent event) {
        return new PaymentWebhookEventResponse(
                event.getId(),
                event.getProvider(),
                event.getProviderEventId(),
                event.getEventType(),
                event.getProviderOrderId(),
                event.getProviderPaymentId(),
                event.getPayloadSha256(),
                event.isSignatureValid(),
                event.getProcessingStatus(),
                event.getProcessedAt(),
                event.getFailureReason(),
                event.getCreatedAt(),
                event.getUpdatedAt());
    }
}
