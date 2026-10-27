package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

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
 * A tenant's "I've paid" for a booking token, and the property's answer to it.
 * Raised once, answered once, never edited. Proof is optional, as it is for
 * rent.
 *
 * <p>Paid from where the tenant is, by UPI or a bank transfer, or handed over
 * at the property's desk (2026-10-11). Cash is claimed only as paid at the
 * desk, where it changes hands.
 */
@Entity
@Table(name = "token_claims", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingTokenClaim extends BaseEntity {

    public static final int MAX_PROOF_IMAGES = 2;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "token_id", nullable = false, updatable = false)
    private UUID tokenId;

    @Column(nullable = false, updatable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 20)
    private ManualPaymentMethod method;

    /** Handed over at the property's desk: in cash, by card, by UPI or by cheque. */
    @Column(name = "paid_at_desk", nullable = false, updatable = false)
    private boolean paidAtDesk;

    @Column(updatable = false, length = 60)
    private String reference;

    @Column(name = "proof_url_1", updatable = false, length = 500)
    private String proofUrl1;

    @Column(name = "proof_url_2", updatable = false, length = 500)
    private String proofUrl2;

    @Column(name = "claimed_by_user_id", nullable = false, updatable = false)
    private UUID claimedByUserId;

    @Column(name = "claimed_at", nullable = false, updatable = false)
    private Instant claimedAt;

    /** Null while the property has not answered. */
    @Enumerated(EnumType.STRING)
    @Column(length = 15)
    private BookingClaimAnswer answer;

    @Column(name = "answer_reason", length = 500)
    private String answerReason;

    @Column(name = "answered_by_user_id")
    private UUID answeredByUserId;

    @Column(name = "answered_at")
    private Instant answeredAt;

    public static BookingTokenClaim raise(UUID tokenId, int sequence, ManualPaymentMethod method, boolean paidAtDesk,
            String reference, List<String> proofUrls, UUID claimedByUserId, Instant claimedAt) {
        if (method == null) {
            throw new IllegalArgumentException("A claim names a way of paying");
        }
        if (method == ManualPaymentMethod.CASH && !paidAtDesk) {
            throw new IllegalArgumentException("Cash is claimed only as paid at the desk");
        }
        if (proofUrls.size() > MAX_PROOF_IMAGES) {
            throw new IllegalArgumentException("A claim carries at most two images");
        }
        BookingTokenClaim claim = new BookingTokenClaim();
        claim.id = UUID.randomUUID();
        claim.tokenId = tokenId;
        claim.sequence = sequence;
        claim.method = method;
        claim.paidAtDesk = paidAtDesk;
        claim.reference = reference;
        claim.proofUrl1 = proofUrls.isEmpty() ? null : proofUrls.get(0);
        claim.proofUrl2 = proofUrls.size() < 2 ? null : proofUrls.get(1);
        claim.claimedByUserId = claimedByUserId;
        claim.claimedAt = claimedAt;
        return claim;
    }

    public boolean isWaiting() {
        return answer == null;
    }

    /** The property's answer. A refusal carries the reason the tenant is shown. */
    public void answer(BookingClaimAnswer answer, String reason, UUID byUserId, Instant at) {
        if (!isWaiting()) {
            throw new IllegalStateException("A claim is answered once");
        }
        this.answer = answer;
        this.answerReason = reason;
        this.answeredByUserId = byUserId;
        this.answeredAt = at;
    }

    public List<String> proofUrls() {
        List<String> urls = new ArrayList<>(MAX_PROOF_IMAGES);
        if (proofUrl1 != null) {
            urls.add(proofUrl1);
        }
        if (proofUrl2 != null) {
            urls.add(proofUrl2);
        }
        return List.copyOf(urls);
    }
}
