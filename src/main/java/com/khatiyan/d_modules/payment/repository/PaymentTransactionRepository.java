package com.khatiyan.d_modules.payment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentTransaction;

/**
 * Persistence access for provider payment attempts.
 *
 * <p>Provider payment ids are unique per gateway and are used to make webhook
 * processing idempotent.
 */
@Repository
public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, UUID> {

    @Query("""
            SELECT transaction
            FROM PaymentTransaction transaction
            WHERE transaction.paymentOrderId = :paymentOrderId
            ORDER BY transaction.createdAt DESC
            """)
    List<PaymentTransaction> findByPaymentOrderId(UUID paymentOrderId);

    @Query("""
            SELECT transaction
            FROM PaymentTransaction transaction
            WHERE transaction.provider = :provider
              AND transaction.providerPaymentId = :providerPaymentId
            """)
    Optional<PaymentTransaction> findByProviderPaymentId(
            PaymentProviderType provider,
            String providerPaymentId);
}
