package com.khatiyan.d_modules.servicebalance.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

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
 * One attempt by an owner to put money in, and afterwards the lot that money
 * was spent from.
 *
 * <p><b>Two jobs, deliberately one row.</b> A refund can only go back to the
 * payment that funded it, so the payment and the remaining refundable amount
 * have to live together — reconstructing which card paid for which rupee after
 * the fact is not possible from a ledger of fungible balances.
 *
 * <p>Top-ups are owner-only. Keeping one payer per account keeps one refund
 * destination per account, so there is never a question of whose money went
 * back where.
 */
@Entity
@Table(name = "service_balance_top_ups", schema = "servicebalance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceBalanceTopUp extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "account_id", nullable = false, updatable = false)
    private UUID accountId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    /**
     * How much of THIS payment could still go back to the card it came from.
     *
     * <p>Set to the full amount when the payment is captured, then eaten by
     * spending oldest-lot-first, and by refunds.
     */
    @Column(name = "remaining_refundable_paise", nullable = false)
    private long remainingRefundablePaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ServiceBalanceTopUpStatus status;

    @Column(nullable = false, updatable = false, length = 20)
    private String provider;

    @Column(name = "provider_order_id", length = 100)
    private String providerOrderId;

    /** Set on capture. Also the credit's idempotency key. */
    @Column(name = "provider_payment_id", length = 100)
    private String providerPaymentId;

    @Column(name = "failure_reason", length = 200)
    private String failureReason;

    @Column(name = "paid_at")
    private Instant paidAt;

    /**
     * When an unfinished checkout stops being worth waiting for.
     *
     * <p>Only closes OUR row. A payment that arrives afterwards is still real
     * money at the gateway, which is exactly why it must never be auto-captured:
     * left uncaptured, the gateway returns it on its own and charges us nothing.
     */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    private ServiceBalanceTopUp(
            UUID accountId, UUID ownerUserId, long amountPaise, String provider, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.accountId = accountId;
        this.ownerUserId = ownerUserId;
        this.amountPaise = amountPaise;
        this.remainingRefundablePaise = 0L;
        this.status = ServiceBalanceTopUpStatus.CREATED;
        this.provider = provider;
        this.expiresAt = expiresAt;
    }

    public static ServiceBalanceTopUp start(
            ServiceBalanceAccount account, long amountPaise, String provider, Instant expiresAt) {
        if (account == null || provider == null || expiresAt == null) {
            throw new ValidationException("A top-up needs an account, a provider and an expiry");
        }
        if (amountPaise <= 0) {
            throw new ValidationException("Enter an amount to add");
        }
        return new ServiceBalanceTopUp(
                account.getId(), account.getOwnerUserId(), amountPaise, provider, expiresAt);
    }

    public void attachOrder(String providerOrderId) {
        this.providerOrderId = providerOrderId;
    }

    /** The payer authorised it. Nothing is ours until it is captured. */
    public void markAuthorized(String providerPaymentId) {
        requireOpen();
        this.providerPaymentId = providerPaymentId;
        this.status = ServiceBalanceTopUpStatus.AUTHORIZED;
    }

    /**
     * Captured and credited. The whole amount becomes refundable, because none
     * of it has been spent yet.
     */
    public void markPaid(String providerPaymentId, Instant paidAt) {
        if (status == ServiceBalanceTopUpStatus.PAID) {
            return;
        }
        requireOpen();
        this.providerPaymentId = providerPaymentId;
        this.status = ServiceBalanceTopUpStatus.PAID;
        this.paidAt = paidAt;
        this.remainingRefundablePaise = amountPaise;
    }

    public void markFailed(String reason) {
        if (status == ServiceBalanceTopUpStatus.PAID) {
            throw new ValidationException("A paid top-up cannot be marked failed");
        }
        this.status = ServiceBalanceTopUpStatus.FAILED;
        this.failureReason = reason;
    }

    /** The checkout window closed with nothing captured. */
    public void markExpired() {
        if (status != ServiceBalanceTopUpStatus.CREATED) {
            return;
        }
        this.status = ServiceBalanceTopUpStatus.EXPIRED;
    }

    /**
     * Spends from this lot, oldest first, and reports how much it could take.
     *
     * <p>Callers walk lots until the amount is met. A lot that is already fully
     * consumed returns zero rather than refusing, because "this one is empty,
     * try the next" is ordinary, not an error.
     */
    public long consume(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Amount must be more than zero");
        }
        long taken = Math.min(remainingRefundablePaise, amountPaise);
        this.remainingRefundablePaise -= taken;
        return taken;
    }

    /**
     * Puts money back into this lot after a refund failed to send.
     *
     * <p>Bounded by the payment itself: a lot can never become refundable for
     * more than was paid into it, however the failure arrived.
     */
    public void restore(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Amount must be more than zero");
        }
        this.remainingRefundablePaise = Math.min(remainingRefundablePaise + amountPaise, this.amountPaise);
    }

    public boolean isPaid() {
        return status == ServiceBalanceTopUpStatus.PAID;
    }

    private void requireOpen() {
        if (status == ServiceBalanceTopUpStatus.FAILED || status == ServiceBalanceTopUpStatus.EXPIRED) {
            throw new ValidationException("This top-up is already closed");
        }
    }
}
