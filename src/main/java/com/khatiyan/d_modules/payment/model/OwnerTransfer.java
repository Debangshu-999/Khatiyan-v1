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
 * One payout of a tenant's payment to the property owner.
 *
 * <p>Exactly one of these may exist per billing cycle — a unique index enforces
 * it — so a cycle that somehow gets paid twice cannot pay the owner twice. Every
 * deduction is stored rather than recomputed, because the fee Razorpay charged
 * for a specific payment is a fact about that payment: it varies by method (UPI
 * is free, cards are not) and cannot be derived later from the amount alone.
 */
@Entity
@Table(name = "owner_transfers", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OwnerTransfer extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "billing_cycle_id", nullable = false, updatable = false)
    private UUID billingCycleId;

    @Column(name = "payment_order_id", nullable = false, updatable = false)
    private UUID paymentOrderId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PaymentProviderType provider;

    @Column(name = "provider_payment_id", length = 120)
    private String providerPaymentId;

    @Column(name = "provider_transfer_id", length = 120)
    private String providerTransferId;

    @Column(name = "linked_account_ref", nullable = false, length = 120)
    private String linkedAccountRef;

    @Column(name = "gross_amount_paise", nullable = false)
    private long grossAmountPaise;

    /** What Razorpay charged for this payment, GST included. */
    @Column(name = "gateway_fee_paise", nullable = false)
    private long gatewayFeePaise;

    /** The GST portion inside {@link #gatewayFeePaise}, split out for the receipt. */
    @Column(name = "gateway_tax_paise", nullable = false)
    private long gatewayTaxPaise;

    @Column(name = "platform_fee_paise", nullable = false)
    private long platformFeePaise;

    @Column(name = "owner_net_paise", nullable = false)
    private long ownerNetPaise;

    @Column(nullable = false, length = 8)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private OwnerTransferStatus status;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "initiated_at", nullable = false)
    private Instant initiatedAt;

    @Column(name = "settled_at")
    private Instant settledAt;

    private OwnerTransfer(
            PaymentOrder order,
            UUID ownerUserId,
            String linkedAccountRef,
            String providerPaymentId,
            long gatewayFeePaise,
            long gatewayTaxPaise,
            long platformFeePaise,
            Instant initiatedAt) {
        long gross = order.getAmountPaise();
        long ownerNet = gross - gatewayFeePaise - platformFeePaise;
        if (ownerNet <= 0) {
            throw new ValidationException("Payment is too small to cover the payment fees");
        }
        if (gatewayFeePaise < 0 || platformFeePaise < 0 || gatewayTaxPaise < 0) {
            throw new ValidationException("Fees cannot be negative");
        }
        if (gatewayTaxPaise > gatewayFeePaise) {
            throw new ValidationException("Gateway tax cannot exceed the gateway fee");
        }

        this.id = UUID.randomUUID();
        this.billingCycleId = order.getBillingCycleId();
        this.paymentOrderId = order.getId();
        this.tenancyId = order.getTenancyId();
        this.propertyId = order.getPropertyId();
        this.ownerUserId = ownerUserId;
        this.provider = order.getProvider();
        this.providerPaymentId = providerPaymentId;
        this.linkedAccountRef = linkedAccountRef;
        this.grossAmountPaise = gross;
        this.gatewayFeePaise = gatewayFeePaise;
        this.gatewayTaxPaise = gatewayTaxPaise;
        this.platformFeePaise = platformFeePaise;
        this.ownerNetPaise = ownerNet;
        this.currency = order.getCurrency();
        this.status = OwnerTransferStatus.PENDING;
        this.initiatedAt = initiatedAt;
    }

    public static OwnerTransfer pending(
            PaymentOrder order,
            UUID ownerUserId,
            String linkedAccountRef,
            String providerPaymentId,
            long gatewayFeePaise,
            long gatewayTaxPaise,
            long platformFeePaise,
            Instant initiatedAt) {
        if (linkedAccountRef == null || linkedAccountRef.isBlank()) {
            throw new ValidationException("Owner linked account reference is required");
        }
        return new OwnerTransfer(
                order,
                ownerUserId,
                linkedAccountRef,
                providerPaymentId,
                gatewayFeePaise,
                gatewayTaxPaise,
                platformFeePaise,
                initiatedAt);
    }

    public void attachProviderTransfer(String providerTransferId) {
        this.providerTransferId = providerTransferId;
    }

    public void markProcessed() {
        this.status = OwnerTransferStatus.PROCESSED;
        this.failureReason = null;
    }

    public void markSettled(Instant settledAt) {
        this.status = OwnerTransferStatus.SETTLED;
        this.settledAt = settledAt;
        this.failureReason = null;
    }

    /** The money stayed in the platform account; it was never sent. */
    public void markFailed(String failureReason) {
        this.status = OwnerTransferStatus.FAILED;
        this.failureReason = failureReason;
    }

    /**
     * Puts a failed payout back in flight. The row is reused rather than
     * replaced because one transfer per cycle is a database constraint — a
     * second row could never be inserted.
     */
    public void markRetrying(String linkedAccountRef) {
        if (status != OwnerTransferStatus.FAILED) {
            throw new ValidationException("Only a failed transfer can be retried");
        }
        if (linkedAccountRef == null || linkedAccountRef.isBlank()) {
            throw new ValidationException("Owner linked account reference is required");
        }

        this.linkedAccountRef = linkedAccountRef;
        this.providerTransferId = null;
        this.failureReason = null;
        this.status = OwnerTransferStatus.PENDING;
    }

    public boolean isFailed() {
        return status == OwnerTransferStatus.FAILED;
    }
}
