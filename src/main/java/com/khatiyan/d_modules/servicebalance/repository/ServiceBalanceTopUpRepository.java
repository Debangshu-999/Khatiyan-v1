package com.khatiyan.d_modules.servicebalance.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUpStatus;

public interface ServiceBalanceTopUpRepository extends JpaRepository<ServiceBalanceTopUp, UUID> {

    Optional<ServiceBalanceTopUp> findByProviderOrderId(String providerOrderId);

    Optional<ServiceBalanceTopUp> findByProviderPaymentId(String providerPaymentId);

    Page<ServiceBalanceTopUp> findByOwnerUserIdOrderByCreatedAtDesc(UUID ownerUserId, Pageable pageable);

    /**
     * Checkouts for one owner that have not finished.
     *
     * <p>Read whenever the owner looks at their balance, so a payment the app
     * forgot about — a reload, a swipe away, a killed process — is still
     * reconciled with the gateway rather than lost.
     */
    List<ServiceBalanceTopUp> findByOwnerUserIdAndStatusInAndCreatedAtAfter(
            UUID ownerUserId, Collection<ServiceBalanceTopUpStatus> statuses, Instant createdAfter);

    /** The same, across every owner, for the background sweep. */
    List<ServiceBalanceTopUp> findByStatusInAndCreatedAtAfter(
            Collection<ServiceBalanceTopUpStatus> statuses, Instant createdAfter);

    /** The sweep that closes abandoned checkouts. */
    List<ServiceBalanceTopUp> findByStatusAndExpiresAtBefore(ServiceBalanceTopUpStatus status, Instant before);

    /**
     * Refund lots with money left in them, oldest first.
     *
     * <p>Oldest-first matters: it keeps young payments refundable for longer,
     * and gateways only refund to source within a window.
     */
    List<ServiceBalanceTopUp> findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
            UUID accountId, long minimumRemainingPaise);
}
