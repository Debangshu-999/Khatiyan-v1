package com.khatiyan.d_modules.payment.model;

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
 * Provider-side payment attempt.
 *
 * <p>A billing cycle payment order may receive provider callbacks or frontend
 * verification payloads. Each concrete provider payment id is stored here so
 * duplicate webhook deliveries do not duplicate billing updates.
 */
@Entity
@Table(name = "payment_transactions", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentTransaction extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "payment_order_id", nullable = false)
    private UUID paymentOrderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentProviderType provider;

    @Column(name = "provider_order_id", length = 120)
    private String providerOrderId;

    @Column(name = "provider_payment_id", length = 120)
    private String providerPaymentId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentTransactionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private PaymentMethod method;

    @Column(name = "provider_status", length = 80)
    private String providerStatus;

    @Column(name = "failure_code", length = 120)
    private String failureCode;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "paid_at")
    private Instant paidAt;

    private PaymentTransaction(
            UUID paymentOrderId,
            PaymentProviderType provider,
            String providerOrderId,
            String providerPaymentId,
            long amountPaise,
            String currency,
            PaymentTransactionStatus status) {
        validateAmount(amountPaise);

        this.id = UUID.randomUUID();
        this.paymentOrderId = paymentOrderId;
        this.provider = provider;
        this.providerOrderId = providerOrderId;
        this.providerPaymentId = providerPaymentId;
        this.amountPaise = amountPaise;
        this.currency = currency;
        this.status = status;
    }

    public static PaymentTransaction initiated(
            UUID paymentOrderId,
            PaymentProviderType provider,
            String providerOrderId,
            long amountPaise,
            String currency) {
        return new PaymentTransaction(
                paymentOrderId,
                provider,
                providerOrderId,
                null,
                amountPaise,
                currency,
                PaymentTransactionStatus.INITIATED);
    }

    public static PaymentTransaction successful(
            UUID paymentOrderId,
            PaymentProviderType provider,
            String providerOrderId,
            String providerPaymentId,
            long amountPaise,
            String currency,
            PaymentMethod method,
            String providerStatus,
            Instant paidAt) {
        PaymentTransaction transaction = new PaymentTransaction(
                paymentOrderId,
                provider,
                providerOrderId,
                providerPaymentId,
                amountPaise,
                currency,
                PaymentTransactionStatus.SUCCESS);

        transaction.method = method;
        transaction.providerStatus = providerStatus;
        transaction.paidAt = paidAt;
        return transaction;
    }

    public static PaymentTransaction failed(
            UUID paymentOrderId,
            PaymentProviderType provider,
            String providerOrderId,
            String providerPaymentId,
            long amountPaise,
            String currency,
            PaymentMethod method,
            String providerStatus,
            String failureCode,
            String failureReason) {
        PaymentTransaction transaction = new PaymentTransaction(
                paymentOrderId,
                provider,
                providerOrderId,
                providerPaymentId,
                amountPaise,
                currency,
                PaymentTransactionStatus.FAILED);

        transaction.method = method;
        transaction.providerStatus = providerStatus;
        transaction.failureCode = failureCode;
        transaction.failureReason = failureReason;
        return transaction;
    }

    private static void validateAmount(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Payment transaction amount must be positive");
        }
    }
}
