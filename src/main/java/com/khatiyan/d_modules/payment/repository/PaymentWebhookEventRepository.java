package com.khatiyan.d_modules.payment.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentWebhookEvent;

/**
 * Persistence access for raw provider webhooks.
 *
 * <p>Webhook rows are checked by provider event id and payload hash so repeated
 * provider retries do not process the same money event more than once.
 */
@Repository
public interface PaymentWebhookEventRepository extends JpaRepository<PaymentWebhookEvent, UUID> {

    @Query("""
            SELECT event
            FROM PaymentWebhookEvent event
            WHERE event.provider = :provider
              AND event.providerEventId = :providerEventId
            """)
    Optional<PaymentWebhookEvent> findByProviderEventId(
            PaymentProviderType provider,
            String providerEventId);

    @Query("""
            SELECT event
            FROM PaymentWebhookEvent event
            WHERE event.provider = :provider
              AND event.payloadSha256 = :payloadSha256
            """)
    Optional<PaymentWebhookEvent> findByPayloadSha256(
            PaymentProviderType provider,
            String payloadSha256);
}
