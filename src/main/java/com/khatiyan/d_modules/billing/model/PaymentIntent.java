package com.khatiyan.d_modules.billing.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A tenant's claim that they have paid a bill, and the owner's verdict on it.
 *
 * <p>
 * No money passes through this app. The tenant's own banking app moves it
 * straight to the owner over UPI, and what this row holds is the claim, the
 * evidence offered for it, and who decided what. That is what keeps the flow
 * outside the RBI Payment Aggregator rules that parked the gateway module.
 *
 * <p>
 * <b>The amount, reference code and VPA are snapshots.</b> A bill cannot change
 * after activation, but a claim still has to be answerable against exactly what
 * the tenant was shown and exactly what their banking app was handed — not
 * against whatever the related rows say by the time somebody reviews it.
 */
@Entity
@Table(name = "payment_intents", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentIntent extends BaseEntity {

    public static final int MAX_REFERENCE_LENGTH = 60;
    public static final int MAX_NOTE_LENGTH = 500;

    /**
     * Two, matching the manual-payment proof cap.
     *
     * <p>
     * A transfer produces one screenshot. The second is for the person who
     * photographs the confirmation and the passbook line separately.
     */
    public static final int MAX_PROOF_IMAGES = 2;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "billing_cycle_id", nullable = false, updatable = false)
    private UUID billingCycleId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    /**
     * Never null, unlike most tenant references in billing.
     *
     * <p>
     * A guest stay has no account, so nobody can sign in to raise an intent —
     * the whole flow starts from the tenant's own bill screen. A daily guest is
     * settled at the desk and recorded by the owner as a manual payment.
     */
    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private PaymentIntentStatus status;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    /** The bill's short code — what the owner matches in their bank statement. */
    @Column(name = "reference_code", nullable = false, length = 40, updatable = false)
    private String referenceCode;

    @Column(name = "upi_vpa", nullable = false, length = 120, updatable = false)
    private String upiVpa;

    /** The tenant's UTR, if they had one to hand. Optional by design. */
    @Column(name = "tenant_reference_text", length = MAX_REFERENCE_LENGTH)
    private String tenantReferenceText;

    @Column(name = "tenant_note", length = MAX_NOTE_LENGTH)
    private String tenantNote;

    /**
     * The tenant's screenshots, in the order attached.
     *
     * <p>EAGER for the same reason the manual-payment proofs are: this is read
     * straight into a response DTO, and a lazy list would throw the moment that
     * mapping happened outside the transaction. Two rows at most.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "payment_intent_proofs",
            schema = "billing",
            joinColumns = @JoinColumn(name = "payment_intent_id"))
    @OrderColumn(name = "position")
    @Column(name = "url", nullable = false, length = 500)
    private List<String> proofImageUrls = new ArrayList<>();

    @Column(name = "tenant_decided_at")
    private Instant tenantDecidedAt;

    @Column(name = "owner_decided_at")
    private Instant ownerDecidedAt;

    @Column(name = "owner_decided_by_user_id")
    private UUID ownerDecidedByUserId;

    private PaymentIntent(
            UUID billingCycleId,
            UUID propertyId,
            UUID tenancyId,
            UUID tenantUserId,
            long amountPaise,
            String referenceCode,
            String upiVpa) {
        this.id = UUID.randomUUID();
        this.billingCycleId = billingCycleId;
        this.propertyId = propertyId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.status = PaymentIntentStatus.CREATED;
        this.amountPaise = amountPaise;
        this.referenceCode = referenceCode;
        this.upiVpa = upiVpa;
    }

    public static PaymentIntent open(
            UUID billingCycleId,
            UUID propertyId,
            UUID tenancyId,
            UUID tenantUserId,
            long amountPaise,
            String referenceCode,
            String upiVpa) {
        if (amountPaise <= 0) {
            throw new ValidationException("A payment link needs an amount greater than zero.");
        }
        return new PaymentIntent(
                billingCycleId, propertyId, tenancyId, tenantUserId, amountPaise, referenceCode, upiVpa);
    }

    public boolean isLive() {
        return status.isLive();
    }

    /**
     * The tenant says it did not go through.
     *
     * <p>Only from CREATED. Once they have claimed success the owner is looking
     * at it, and withdrawing a claim under review would leave the owner ruling
     * on something that no longer exists.
     */
    public void cancelByTenant() {
        if (status != PaymentIntentStatus.CREATED) {
            throw new ValidationException("This payment attempt has already been answered.");
        }
        this.status = PaymentIntentStatus.TENANT_CANCELLED;
        this.tenantDecidedAt = Instant.now();
    }

    /**
     * The tenant says the money is sent. Evidence is optional.
     *
     * <p>Deliberately accepted with neither a reference nor a screenshot: a
     * tenant who has genuinely paid should not be blocked by not knowing where
     * their banking app hides the UTR. The owner still has the short code in
     * their statement, which is the match that actually matters.
     */
    public void confirmByTenant(String referenceText, String note, List<String> proofUrls) {
        if (status != PaymentIntentStatus.CREATED) {
            throw new ValidationException("This payment attempt has already been answered.");
        }
        String trimmedReference = trimmedOrNull(referenceText, MAX_REFERENCE_LENGTH, "reference");
        String trimmedNote = trimmedOrNull(note, MAX_NOTE_LENGTH, "note");
        List<String> urls = proofUrls == null ? List.of() : proofUrls;
        if (urls.size() > MAX_PROOF_IMAGES) {
            throw new ValidationException("Attach at most " + MAX_PROOF_IMAGES + " images.");
        }

        this.tenantReferenceText = trimmedReference;
        this.tenantNote = trimmedNote;
        this.proofImageUrls = new ArrayList<>(urls);
        this.status = PaymentIntentStatus.TENANT_CONFIRMED;
        this.tenantDecidedAt = Instant.now();
    }

    /** The owner found it in their statement. */
    public void verifyByOwner(UUID ownerUserId) {
        requireAwaitingOwner();
        this.status = PaymentIntentStatus.OWNER_VERIFIED;
        stampOwnerDecision(ownerUserId);
    }

    /** The owner could not find it. */
    public void rejectByOwner(UUID ownerUserId) {
        requireAwaitingOwner();
        this.status = PaymentIntentStatus.OWNER_REJECTED;
        stampOwnerDecision(ownerUserId);
    }

    private void requireAwaitingOwner() {
        if (status != PaymentIntentStatus.TENANT_CONFIRMED) {
            throw new ValidationException("This payment attempt is not waiting for a decision.");
        }
    }

    private void stampOwnerDecision(UUID ownerUserId) {
        if (ownerUserId == null) {
            throw new ValidationException("A payment decision must record who made it.");
        }
        this.ownerDecidedAt = Instant.now();
        this.ownerDecidedByUserId = ownerUserId;
    }

    private static String trimmedOrNull(String value, int maxLength, String what) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > maxLength) {
            throw new ValidationException("The " + what + " can be at most " + maxLength + " characters.");
        }
        return trimmed;
    }
}
