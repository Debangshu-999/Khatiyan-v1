package com.khatiyan.d_modules.billing.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.billing.model.BillingManualPayment;

public interface BillingManualPaymentRepository extends JpaRepository<BillingManualPayment, UUID> {

    @Query("""
        SELECT payment
        FROM BillingManualPayment payment
        WHERE payment.billingCycleId = :billingCycleId
        ORDER BY payment.collectedAt DESC
    """)
    List<BillingManualPayment> findByBillingCycleId(UUID billingCycleId);

    @Query("""
        SELECT COUNT(DISTINCT payment.billingCycleId)
        FROM BillingManualPayment payment
        WHERE payment.propertyId = :propertyId
    """)
    long countDistinctPaidCyclesByPropertyId(UUID propertyId);

    @Query("""
        SELECT COALESCE(SUM(payment.amountPaise), 0)
        FROM BillingManualPayment payment
        WHERE payment.propertyId = :propertyId
    """)
    long sumAmountByPropertyId(UUID propertyId);

    @Query("""
        SELECT COALESCE(SUM(payment.amountPaise), 0)
        FROM BillingManualPayment payment
        WHERE payment.propertyId = :propertyId
          AND payment.collectedAt >= :fromInstant
          AND payment.collectedAt < :toInstant
    """)
    long sumAmountByPropertyAndCollectedBetween(UUID propertyId, Instant fromInstant, Instant toInstant);

    @Query("""
        SELECT COUNT(DISTINCT payment.billingCycleId)
        FROM BillingManualPayment payment
        WHERE payment.propertyId = :propertyId
          AND payment.collectedAt >= :fromInstant
          AND payment.collectedAt < :toInstant
    """)
    long countDistinctCyclesByPropertyAndCollectedBetween(UUID propertyId, Instant fromInstant, Instant toInstant);
}
