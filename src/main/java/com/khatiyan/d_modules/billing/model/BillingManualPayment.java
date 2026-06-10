package com.khatiyan.d_modules.billing.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

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
 * One manually-collected (offline) payment for a billing cycle — cash, UPI,
 * bank transfer, cheque, etc. recorded by an owner/manager. Partial payments
 * are not supported yet, so a manual payment always covers the full cycle
 * total and the cycle is marked paid in the same transaction.
 */
@Entity
@Table(name = "billing_manual_payments", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BillingManualPayment extends BaseEntity {

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ManualPaymentMethod method;

    @Column(name = "reference_text", length = 120)
    private String referenceText;

    @Column(name = "proof_image_url", length = 600)
    private String proofImageUrl;

    @Column(length = 500)
    private String note;

    @Column(name = "collected_by_user_id", nullable = false)
    private UUID collectedByUserId;

    @Column(name = "collected_at", nullable = false)
    private Instant collectedAt;

    private BillingManualPayment(
            UUID billingCycleId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            long amountPaise,
            ManualPaymentMethod method,
            String referenceText,
            String proofImageUrl,
            String note,
            UUID collectedByUserId,
            Instant collectedAt) {
        this.id = UUID.randomUUID();
        this.billingCycleId = billingCycleId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.amountPaise = amountPaise;
        this.method = method;
        this.referenceText = referenceText;
        this.proofImageUrl = proofImageUrl;
        this.note = note;
        this.collectedByUserId = collectedByUserId;
        this.collectedAt = collectedAt;
    }

    public static BillingManualPayment record(
            UUID billingCycleId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            long amountPaise,
            ManualPaymentMethod method,
            String referenceText,
            String proofImageUrl,
            String note,
            UUID collectedByUserId,
            Instant collectedAt) {
        return new BillingManualPayment(
                billingCycleId,
                tenancyId,
                tenantUserId,
                propertyId,
                amountPaise,
                method,
                referenceText,
                proofImageUrl,
                note,
                collectedByUserId,
                collectedAt);
    }
}
