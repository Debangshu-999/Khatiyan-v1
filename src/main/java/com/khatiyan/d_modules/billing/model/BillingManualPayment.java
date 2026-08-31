package com.khatiyan.d_modules.billing.model;

import java.util.ArrayList;
import java.util.List;
import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
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

    // Null when the stay was a daily guest one, which has no account behind it.
    @Column(name = "tenant_user_id")
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

    /**
     * The proof photos, in the order they were attached.
     *
     * <p>EAGER on purpose. `@ElementCollection` is lazy by default, and this is
     * read straight into a response DTO — a lazy list would throw the moment
     * that mapping happened outside the transaction. At a cap of two rows there
     * is nothing to defer.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "billing_manual_payment_proofs",
            schema = "billing",
            joinColumns = @JoinColumn(name = "manual_payment_id"))
    @OrderColumn(name = "position")
    @Column(name = "image_url", length = 600, nullable = false)
    private List<String> proofImageUrls = new ArrayList<>();

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
            List<String> proofImageUrls,
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
        this.proofImageUrls = proofImageUrls == null ? new ArrayList<>() : new ArrayList<>(proofImageUrls);
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
            List<String> proofImageUrls,
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
                proofImageUrls,
                note,
                collectedByUserId,
                collectedAt);
    }
}
