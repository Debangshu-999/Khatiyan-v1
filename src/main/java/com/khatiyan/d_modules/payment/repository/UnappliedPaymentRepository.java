package com.khatiyan.d_modules.payment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.UnappliedPayment;
import com.khatiyan.d_modules.payment.model.UnappliedPaymentStatus;

@Repository
public interface UnappliedPaymentRepository extends JpaRepository<UnappliedPayment, UUID> {

    /** Guards against a webhook redelivery creating a second refund obligation. */
    Optional<UnappliedPayment> findByProviderAndProviderPaymentId(
            PaymentProviderType provider,
            String providerPaymentId);

    List<UnappliedPayment> findByStatusOrderByCapturedAtAsc(UnappliedPaymentStatus status);

    List<UnappliedPayment> findByTenantUserIdOrderByCapturedAtDesc(UUID tenantUserId);
}
