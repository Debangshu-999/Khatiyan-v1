package com.khatiyan.d_modules.verification.model;

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
 * One run at a check, and one line on the owner's bill.
 *
 * <p>An attempt exists from the moment the provider is asked to send an OTP,
 * because that is the moment the work — and the cost — begins. It never holds
 * the Aadhaar number it was started with: that value crosses this module on its
 * way to the provider and is not written down, which is the simplest way to
 * honour a masking rule.
 *
 * <p>Its price is frozen at the price when it ran. Configuration changes, and a
 * charge made last month must not start looking wrong the day one does.
 */
@Entity
@Table(name = "verification_attempts", schema = "verification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VerificationAttempt extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "grant_id", nullable = false, updatable = false)
    private UUID grantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private VerificationAttemptStatus status;

    /**
     * What we called this attempt when we asked the provider.
     *
     * <p>Ours, not theirs, and unique — it is how their answer finds its way
     * back to this row.
     */
    @Column(name = "provider_reference", nullable = false, updatable = false, length = 64)
    private String providerReference;

    /** Their id for the same thing, quoted when something needs disputing. */
    @Column(name = "provider_transaction_id", length = 120)
    private String providerTransactionId;

    /**
     * The last digits of the phone the code went to.
     *
     * <p>All the provider returns, and all the tenant needs in order to know
     * which handset to look at.
     */
    @Column(name = "linked_mobile_hint", length = 8)
    private String linkedMobileHint;

    @Column(name = "price_paise", nullable = false, updatable = false)
    private long pricePaise;

    @Column(name = "charged_at")
    private Instant chargedAt;

    @Column(name = "failure_reason", length = 200)
    private String failureReason;

    @Column(name = "otp_expires_at")
    private Instant otpExpiresAt;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    /** The provider's id for an Aadhaar App session. */
    @Column(name = "provider_session_id", length = 120)
    private String providerSessionId;

    @Column(name = "session_expires_at")
    private Instant sessionExpiresAt;

    /** SHA-256 of the one-time token in the callback URL. Never the token itself. */
    @Column(name = "callback_token_hash", length = 64, updatable = false)
    private String callbackTokenHash;

    /** The Aadhaar App intent link, so a tenant who comes back can reopen it. */
    @Column(name = "intent_url")
    private String intentUrl;

    /** Whether the Aadhaar App's face check passed. Null when it was not run. */
    @Column(name = "face_matched")
    private Boolean faceMatched;

    // Optimistic lock: the version on BaseEntity (2026-09-28).

    private VerificationAttempt(UUID grantId, String providerReference, long pricePaise, Instant startedAt) {
        this.id = UUID.randomUUID();
        this.grantId = grantId;
        this.providerReference = providerReference;
        this.pricePaise = pricePaise;
        this.startedAt = startedAt;
        this.status = VerificationAttemptStatus.AWAITING_OTP;
    }

    /**
     * Opens an attempt that waits for an Aadhaar App callback rather than an OTP.
     *
     * <p>{@code callbackTokenHash} is the hash of the token the callback URL
     * carries: the only thing that makes a posted result this attempt's.
     */
    public static VerificationAttempt startSession(
            UUID grantId, String providerReference, long pricePaise, Instant startedAt, String callbackTokenHash) {
        if (callbackTokenHash == null || callbackTokenHash.isBlank()) {
            throw new ValidationException("A session attempt needs a callback token");
        }
        VerificationAttempt attempt = start(grantId, providerReference, pricePaise, startedAt);
        attempt.status = VerificationAttemptStatus.AWAITING_CONSENT;
        attempt.callbackTokenHash = callbackTokenHash;
        return attempt;
    }

    /** The provider opened the session: where to send the tenant, and until when. */
    public void sessionOpened(String providerSessionId, String intentUrl, Instant sessionExpiresAt) {
        this.providerSessionId = providerSessionId;
        this.intentUrl = intentUrl;
        this.sessionExpiresAt = sessionExpiresAt;
    }

    public boolean sessionHasExpired(Instant now) {
        return status == VerificationAttemptStatus.AWAITING_CONSENT
                && sessionExpiresAt != null
                && now.isAfter(sessionExpiresAt);
    }

    public void recordFaceMatch(Boolean faceMatched) {
        this.faceMatched = faceMatched;
    }

    public static VerificationAttempt start(UUID grantId, String providerReference, long pricePaise, Instant startedAt) {
        if (grantId == null || providerReference == null || providerReference.isBlank() || startedAt == null) {
            throw new ValidationException("An attempt needs a grant, a reference and a start time");
        }
        if (pricePaise < 0) {
            throw new ValidationException("An attempt cannot cost less than nothing");
        }
        return new VerificationAttempt(grantId, providerReference, pricePaise, startedAt);
    }

    /** The provider accepted the number and sent a code. */
    public void otpSent(String providerTransactionId, String linkedMobileHint, Instant otpExpiresAt) {
        this.providerTransactionId = providerTransactionId;
        this.linkedMobileHint = linkedMobileHint;
        this.otpExpiresAt = otpExpiresAt;
    }

    public boolean isOpen() {
        return status == VerificationAttemptStatus.AWAITING_OTP
                || status == VerificationAttemptStatus.AWAITING_CONSENT;
    }

    public boolean otpHasExpired(Instant now) {
        return otpExpiresAt != null && now.isAfter(otpExpiresAt);
    }

    public void markSucceeded(Instant at) {
        requireOpen();
        this.status = VerificationAttemptStatus.SUCCEEDED;
        this.completedAt = at;
    }

    /**
     * The provider answered and the answer was no.
     *
     * <p>Still a completed attempt. They did the work and billed us for it, so
     * calling it something else would only move the cost onto us.
     */
    public void markFailed(String reason, Instant at) {
        requireOpen();
        this.status = VerificationAttemptStatus.FAILED;
        this.failureReason = reason;
        this.completedAt = at;
    }

    /** The code was never submitted, or the session never answered, and the window closed. */
    public void markExpired(Instant at) {
        if (!isOpen()) {
            return;
        }
        this.failureReason = status == VerificationAttemptStatus.AWAITING_CONSENT
                ? "The Aadhaar App session closed before it was completed"
                : "The code expired before it was entered";
        this.status = VerificationAttemptStatus.EXPIRED;
        this.completedAt = at;
    }

    /** Records that the owner's balance has now been billed for this attempt. */
    public void markCharged(Instant at) {
        this.chargedAt = at;
    }

    public boolean isCharged() {
        return chargedAt != null;
    }

    private void requireOpen() {
        if (!isOpen()) {
            throw new ValidationException("This attempt is already finished");
        }
    }
}
