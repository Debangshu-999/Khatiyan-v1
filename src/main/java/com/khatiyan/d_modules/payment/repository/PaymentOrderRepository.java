package com.khatiyan.d_modules.payment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.PaymentOrder;
import com.khatiyan.d_modules.payment.model.PaymentOrderStatus;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * Persistence access for payment orders.
 *
 * <p>Payment orders are queried by billing cycle, tenant, property, and
 * provider order id during checkout, webhook processing, and payment history.
 */
@Repository
public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, UUID> {

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.referenceCode = :referenceCode
            """)
    Optional<PaymentOrder> findByReferenceCode(String referenceCode);

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.billingCycleId = :billingCycleId
            ORDER BY paymentOrder.createdAt DESC
            """)
    List<PaymentOrder> findByBillingCycleId(UUID billingCycleId);

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.billingCycleId = :billingCycleId
              AND paymentOrder.status IN :statuses
            ORDER BY paymentOrder.createdAt DESC
            """)
    List<PaymentOrder> findByBillingCycleIdAndStatuses(
            UUID billingCycleId,
            List<PaymentOrderStatus> statuses);

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.tenantUserId = :tenantUserId
            ORDER BY paymentOrder.createdAt DESC
            """)
    List<PaymentOrder> findByTenantUserId(UUID tenantUserId);

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.propertyId = :propertyId
            ORDER BY paymentOrder.createdAt DESC
            """)
    List<PaymentOrder> findByPropertyId(UUID propertyId);

    @Query("""
            SELECT paymentOrder
            FROM PaymentOrder paymentOrder
            WHERE paymentOrder.provider = :provider
              AND paymentOrder.providerOrderId = :providerOrderId
            """)
    Optional<PaymentOrder> findByProviderOrderId(
            PaymentProviderType provider,
            String providerOrderId);
}
