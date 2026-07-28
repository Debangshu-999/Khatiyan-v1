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
 * Money the gateway captured that no bill could absorb.
 *
 * <p>The alternative to this row is worse in both directions: throwing leaves
 * the money captured with nothing recorded, and returning silently leaves it
 * captured with nothing recorded <em>and</em> no error. Either way the platform
 * account holds funds belonging to a tenant with no trail. This row is that
 * trail, and the refund worklist.
 */
@Entity
@Table(name = "unapplied_payments", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UnappliedPayment extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "payment_order_id", nullable = false, updatable = false)
    private UUID paymentOrderId;

    @Column(name = "billing_cycle_id", nullable = false, updatable = false)
    private UUID billingCycleId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PaymentProviderType provider;

    @Column(name = "provider_order_id", length = 120)
    private String providerOrderId;

    @Column(name = "provider_payment_id", length = 120)
    private String providerPaymentId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false, length = 8)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private UnappliedPaymentReason reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private UnappliedPaymentStatus status;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    @Column(name = "captured_at", nullable = false)
    private Instant capturedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    /** Null for an automated refund; set when a person closed the row. */
    @Column(name = "resolved_by_user_id")
    private UUID resolvedByUserId;

    private UnappliedPayment(
            PaymentOrder order,
            String providerPaymentId,
            UnappliedPaymentReason reason,
            Instant capturedAt) {
        this.id = UUID.randomUUID();
        this.paymentOrderId = order.getId();
        this.billingCycleId = order.getBillingCycleId();
        this.tenancyId = order.getTenancyId();
        this.tenantUserId = order.getTenantUserId();
        this.propertyId = order.getPropertyId();
        this.provider = order.getProvider();
        this.providerOrderId = order.getProviderOrderId();
        this.providerPaymentId = providerPaymentId;
        this.amountPaise = order.getAmountPaise();
        this.currency = order.getCurrency();
        this.reason = reason;
        this.status = UnappliedPaymentStatus.PENDING_REFUND;
        this.capturedAt = capturedAt;
    }

    public static UnappliedPayment held(
            PaymentOrder order,
            String providerPaymentId,
            UnappliedPaymentReason reason,
            Instant capturedAt) {
        if (order == null) {
            throw new ValidationException("Payment order is required");
        }
        if (reason == null) {
            throw new ValidationException("Unapplied payment reason is required");
        }
        return new UnappliedPayment(order, providerPaymentId, reason, capturedAt);
    }

    /**
     * The money went back to the tenant. Self-justifying — the gateway refund is
     * the evidence — so the note is optional and usually just the refund id.
     * {@code resolvedByUserId} is null when an automated job did it.
     */
    public void markRefunded(Instant resolvedAt, UUID resolvedByUserId, String resolutionNote) {
        this.status = UnappliedPaymentStatus.REFUNDED;
        this.resolvedAt = resolvedAt;
        this.resolvedByUserId = resolvedByUserId;
        this.resolutionNote = trimmedOrNull(resolutionNote);
    }

    /**
     * Closes the row while the platform still holds the money — the only ending
     * that leaves a tenant out of pocket. Both a person and a reason are
     * mandatory, so this can never be the quiet way to tidy a worklist.
     */
    public void writeOff(Instant resolvedAt, UUID resolvedByUserId, String resolutionNote) {
        // isBlank() is whitespace-aware, so "   " cannot buy its way past this.
        if (resolutionNote == null || resolutionNote.isBlank()) {
            throw new ValidationException("A write-off must record why the money was not refunded");
        }
        if (resolvedByUserId == null) {
            throw new ValidationException("A write-off must record who closed it");
        }

        this.status = UnappliedPaymentStatus.WRITTEN_OFF;
        this.resolvedAt = resolvedAt;
        this.resolvedByUserId = resolvedByUserId;
        this.resolutionNote = resolutionNote.trim();
    }

    private static String trimmedOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
