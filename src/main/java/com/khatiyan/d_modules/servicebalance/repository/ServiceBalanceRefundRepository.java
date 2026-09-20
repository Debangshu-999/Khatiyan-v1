package com.khatiyan.d_modules.servicebalance.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefund;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundReason;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundStatus;

public interface ServiceBalanceRefundRepository extends JpaRepository<ServiceBalanceRefund, UUID> {

    Optional<ServiceBalanceRefund> findByProviderRefundId(String providerRefundId);

    /**
     * Whether this payment has already been sent back.
     *
     * <p>Scoped to the reason because an ordinary balance refund drawn in
     * pieces shares one payment id across several rows, while a payment that
     * never reached a balance must be returned exactly once.
     */
    Optional<ServiceBalanceRefund> findByProviderPaymentIdAndReason(
            String providerPaymentId, ServiceBalanceRefundReason reason);

    List<ServiceBalanceRefund> findByOwnerUserIdOrderByCreatedAtDesc(UUID ownerUserId);

    /** Refunds written down but never sent, for the sweep that finishes them. */
    List<ServiceBalanceRefund> findByStatus(ServiceBalanceRefundStatus status);
}
