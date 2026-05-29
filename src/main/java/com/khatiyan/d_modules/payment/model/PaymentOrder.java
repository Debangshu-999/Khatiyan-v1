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
 * Internal payment order for a billing cycle.
 *
 * <p>This is the payment module's source of truth for a tenant checkout.
 * The frontend receives provider checkout details from this order, but the
 * order is marked paid only after provider verification/webhook processing.
 */
@Entity
@Table(name = "payment_orders", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentOrder extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "billing_cycle_id", nullable = false)
    private UUID billingCycleId;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentProviderType provider;

    @Column(name = "provider_order_id", length = 120)
    private String providerOrderId;

    @Column(name = "provider_checkout_reference", length = 255)
    private String providerCheckoutReference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentOrderStatus status;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    private PaymentOrder(
            UUID billingCycleId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            long amountPaise,
            String currency,
            PaymentProviderType provider,
            UUID createdByUserId,
            Instant expiresAt) {
        validateAmount(amountPaise);

        this.id = UUID.randomUUID();
        this.billingCycleId = billingCycleId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.amountPaise = amountPaise;
        this.currency = currency;
        this.provider = provider;
        this.createdByUserId = createdByUserId;
        this.expiresAt = expiresAt;
        this.status = PaymentOrderStatus.CREATED;
    }

    public static PaymentOrder create(
            UUID billingCycleId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            long amountPaise,
            String currency,
            PaymentProviderType provider,
            UUID createdByUserId,
            Instant expiresAt) {
        return new PaymentOrder(
                billingCycleId,
                tenancyId,
                tenantUserId,
                propertyId,
                amountPaise,
                currency,
                provider,
                createdByUserId,
                expiresAt);
    }

    public void attachProviderOrder(String providerOrderId, String providerCheckoutReference) {
        if (providerOrderId == null || providerOrderId.isBlank()) {
            throw new ValidationException("Provider order id is required");
        }

        this.providerOrderId = providerOrderId;
        this.providerCheckoutReference = providerCheckoutReference;
        this.status = PaymentOrderStatus.ATTEMPTED;
    }

    public void markPaid(Instant paidAt) {
        if (this.status == PaymentOrderStatus.PAID) {
            return;
        }

        if (this.status == PaymentOrderStatus.CANCELLED || this.status == PaymentOrderStatus.EXPIRED) {
            throw new ValidationException("Payment order cannot be marked paid");
        }

        this.status = PaymentOrderStatus.PAID;
        this.paidAt = paidAt;
        this.failureReason = null;
    }

    public void markFailed(String failureReason, Instant failedAt) {
        if (this.status == PaymentOrderStatus.PAID) {
            throw new ValidationException("Paid payment order cannot be marked failed");
        }

        this.status = PaymentOrderStatus.FAILED;
        this.failureReason = failureReason;
        this.failedAt = failedAt;
    }

    public void cancel() {
        if (this.status == PaymentOrderStatus.PAID) {
            throw new ValidationException("Paid payment order cannot be cancelled");
        }

        this.status = PaymentOrderStatus.CANCELLED;
    }

    public void expire(Instant now) {
        if (this.status == PaymentOrderStatus.PAID) {
            return;
        }

        this.status = PaymentOrderStatus.EXPIRED;
        this.failedAt = now;
        this.failureReason = "Payment order expired";
    }

    private static void validateAmount(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Payment amount must be positive");
        }
    }
}
