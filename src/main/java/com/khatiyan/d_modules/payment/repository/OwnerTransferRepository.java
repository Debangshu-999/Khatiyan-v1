package com.khatiyan.d_modules.payment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.OwnerTransfer;
import com.khatiyan.d_modules.payment.model.OwnerTransferStatus;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;

@Repository
public interface OwnerTransferRepository extends JpaRepository<OwnerTransfer, UUID> {

    /** The idempotency check before money leaves: one transfer per cycle. */
    Optional<OwnerTransfer> findByBillingCycleId(UUID billingCycleId);

    Optional<OwnerTransfer> findByProviderAndProviderTransferId(
            PaymentProviderType provider,
            String providerTransferId);

    Optional<OwnerTransfer> findByProviderAndProviderPaymentId(
            PaymentProviderType provider,
            String providerPaymentId);

    List<OwnerTransfer> findByOwnerUserIdAndStatusOrderByInitiatedAtDesc(
            UUID ownerUserId,
            OwnerTransferStatus status);

    /**
     * Failed payouts awaiting another attempt. Without this they would sit
     * forever: the "paid cycle with no transfer" sweep cannot see them, because
     * a row already exists.
     */
    List<OwnerTransfer> findByStatusOrderByInitiatedAtAsc(OwnerTransferStatus status);
}
