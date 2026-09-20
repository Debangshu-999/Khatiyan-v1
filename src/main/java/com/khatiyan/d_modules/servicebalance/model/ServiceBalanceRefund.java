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
 * Money going back to the card that sent it.
 *
 * <p>One row per gateway refund, not per request: money can only return to the
 * payments that funded it, so returning Rs 900 drawn from two top-ups is two
 * refunds at the gateway and two rows here.
 *
 * <p>There is no other way out. A refund to a bank account of the owner's
 * choosing would be a withdrawal, which is what makes a balance a regulated
 * payment instrument rather than a closed one.
 */
@Entity
@Table(name = "service_balance_refunds", schema = "servicebalance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceBalanceRefund extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "account_id", nullable = false, updatable = false)
    private UUID accountId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    /**
     * The lot this is drawn from, and so the card that receives it.
     *
     * <p>Null for an unapplied payment: money that reached us and never reached
     * a balance funded nothing, so there is no lot to draw it out of.
     */
    @Column(name = "top_up_id", updatable = false)
    private UUID topUpId;

    /** The payment being returned. Known even when the lot is not. */
    @Column(name = "provider_payment_id", updatable = false, length = 100)
    private String providerPaymentId;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ServiceBalanceRefundStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 30)
    private ServiceBalanceRefundReason reason;

    @Column(name = "provider_refund_id", length = 100)
    private String providerRefundId;

    @Column(name = "failure_reason", length = 200)
    private String failureReason;

    @Column(name = "processed_at")
    private Instant processedAt;

    private ServiceBalanceRefund(
            ServiceBalanceAccount account,
            ServiceBalanceTopUp topUp,
            String providerPaymentId,
            long amountPaise,
            ServiceBalanceRefundReason reason) {
        this.id = UUID.randomUUID();
        this.accountId = account.getId();
        this.ownerUserId = account.getOwnerUserId();
        this.topUpId = topUp == null ? null : topUp.getId();
        this.providerPaymentId = providerPaymentId;
        this.amountPaise = amountPaise;
        this.status = ServiceBalanceRefundStatus.REQUESTED;
        this.reason = reason;
    }

    public static ServiceBalanceRefund request(
            ServiceBalanceAccount account,
            ServiceBalanceTopUp topUp,
            long amountPaise,
            ServiceBalanceRefundReason reason) {
        if (account == null || topUp == null || reason == null) {
            throw new ValidationException("A refund needs an account, a payment and a reason");
        }
        if (amountPaise <= 0) {
            throw new ValidationException("Amount must be more than zero");
        }
        if (!topUp.isPaid()) {
            throw new ValidationException("That payment never completed, so there is nothing to return");
        }
        return new ServiceBalanceRefund(
                account, topUp, topUp.getProviderPaymentId(), amountPaise, reason);
    }

    /**
     * Returns a payment that reached us but never reached a balance.
     *
     * <p>Our process dying between the capture call and the ledger write, or a
     * captured payment for an order we cannot match. The money is ours and
     * should not be.
     *
     * <p><b>Writes no ledger entry.</b> Nothing was ever credited, so debiting a
     * balance to give it back would take the money from the owner twice.
     */
    public static ServiceBalanceRefund unapplied(
            ServiceBalanceAccount account, ServiceBalanceTopUp topUp, String providerPaymentId, long amountPaise) {
        if (providerPaymentId == null || providerPaymentId.isBlank()) {
            throw new ValidationException("An unapplied refund needs the payment it is returning");
        }
        if (amountPaise <= 0) {
            throw new ValidationException("Amount must be more than zero");
        }
        return new ServiceBalanceRefund(
                account, topUp, providerPaymentId, amountPaise, ServiceBalanceRefundReason.UNAPPLIED_PAYMENT);
    }

    /**
     * Handed to the gateway, which has not finished with it.
     *
     * <p>Not PROCESSED: a gateway can accept a refund and refuse it later, and
     * calling that done would leave an owner short with our books saying
     * otherwise.
     */
    public void markSent(String providerRefundId) {
        this.providerRefundId = providerRefundId;
        this.status = ServiceBalanceRefundStatus.SENT;
    }

    public void markProcessed(String providerRefundId, Instant processedAt) {
        this.providerRefundId = providerRefundId;
        this.status = ServiceBalanceRefundStatus.PROCESSED;
        this.processedAt = processedAt;
    }

    /**
     * The gateway would not send it back.
     *
     * <p>A closed card, a dead account, a window that has passed. The money
     * stays on the balance rather than vanishing, because the only other route
     * out is a bank transfer, and that is the door this product does not have.
     */
    public void markFailed(String failureReason) {
        this.status = ServiceBalanceRefundStatus.FAILED;
        this.failureReason = failureReason;
    }
}
