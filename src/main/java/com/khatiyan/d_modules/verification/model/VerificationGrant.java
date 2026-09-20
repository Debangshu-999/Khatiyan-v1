package com.khatiyan.d_modules.verification.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One check an owner ordered for one tenancy, and the tries the tenant gets.
 *
 * <p><b>Every rule about attempts lives here.</b> The count only ever moves
 * through {@link #useAttempt()}, which refuses rather than going past the
 * grant, so no caller can hand out a try that was never paid for by forgetting
 * to look first.
 *
 * <p>The result is held on the grant rather than on the attempt that produced
 * it, because "is this tenant verified" is a question about the tenancy, and
 * answering it should not mean walking a list of failures to find the one that
 * worked.
 */
@Entity
@Table(name = "verification_grants", schema = "verification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VerificationGrant extends BaseEntity {

    /** What an owner may grant at once, matching the picker the app shows. */
    public static final int MIN_ATTEMPTS = 1;
    public static final int MAX_ATTEMPTS = 5;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    /**
     * Who pays for this.
     *
     * <p>Copied from the tenancy rather than looked up. A ledger line has to
     * name a payer years later, and a grant that could only find one by joining
     * through a property that may since have been sold is not one.
     */
    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /**
     * Who has to perform this check.
     *
     * <p>On the grant rather than reached through the tenancy, because every
     * request from the tenant's phone has to answer "is this yours" before
     * anything else, and an authorisation question that needs a cross-module
     * join is one a caller in a hurry will eventually skip.
     */
    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "service_code", nullable = false, updatable = false, length = 40)
    private ServiceCode serviceCode;

    @Column(name = "attempts_granted", nullable = false)
    private int attemptsGranted;

    @Column(name = "attempts_used", nullable = false)
    private int attemptsUsed;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private VerificationGrantStatus status;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "verified_name", length = 160)
    private String verifiedName;

    @Column(name = "verified_dob")
    private LocalDate verifiedDob;

    /**
     * The only fragment of the document that is kept.
     *
     * <p>Enough to tie the record to a specific Aadhaar, not enough to
     * impersonate anybody with, and the fragment UIDAI's own masking convention
     * leaves visible.
     */
    @Column(name = "masked_id_last_four", length = 4)
    private String maskedIdLastFour;

    @Column(name = "name_match_score", precision = 4, scale = 3)
    private BigDecimal nameMatchScore;

    @Column(name = "name_matched")
    private Boolean nameMatched;

    /**
     * Whether the Aadhaar-linked mobile is the phone they signed in with.
     *
     * <p>Null when we could not tell. FALSE is NOT a failure — people register
     * with a work phone, a spouse's, an old SIM they never updated at the
     * enrolment centre. It is a fact the owner may want, never a gate.
     */
    @Column(name = "phone_matched")
    private Boolean phoneMatched;

    @Column(name = "verified_address", length = 300)
    private String verifiedAddress;

    @Column(name = "verified_address_pincode", length = 6)
    private String verifiedAddressPincode;

    /**
     * Whether they were an adult at the moment this was checked.
     *
     * <p>Frozen rather than recomputed. "Were they eighteen when this tenancy
     * was created" is the question a dispute asks, and that answer must not
     * change with the calendar.
     */
    @Column(name = "adult_at_verification")
    private Boolean adultAtVerification;

    @Column(name = "created_by_user_id", updatable = false)
    private UUID createdByUserId;

    @Version
    @Column(nullable = false)
    private long version;

    private VerificationGrant(
            UUID tenancyId,
            UUID ownerUserId,
            UUID propertyId,
            UUID tenantUserId,
            ServiceCode serviceCode,
            int attemptsGranted,
            UUID createdByUserId) {
        this.id = UUID.randomUUID();
        this.tenancyId = tenancyId;
        this.ownerUserId = ownerUserId;
        this.propertyId = propertyId;
        this.tenantUserId = tenantUserId;
        this.serviceCode = serviceCode;
        this.attemptsGranted = attemptsGranted;
        this.attemptsUsed = 0;
        this.status = VerificationGrantStatus.PENDING;
        this.createdByUserId = createdByUserId;
    }

    public static VerificationGrant order(
            UUID tenancyId,
            UUID ownerUserId,
            UUID propertyId,
            UUID tenantUserId,
            ServiceCode serviceCode,
            int attemptsGranted,
            UUID createdByUserId) {
        if (tenancyId == null || ownerUserId == null || propertyId == null || serviceCode == null) {
            throw new ValidationException("A verification needs a tenancy, an owner, a property and a service");
        }
        if (tenantUserId == null) {
            // A guest stay has no account, so nobody could ever perform this.
            // Ordering one would take the owner's money for work that cannot
            // happen.
            throw new ValidationException("Only a tenant with an account can be asked to verify");
        }
        if (attemptsGranted < MIN_ATTEMPTS || attemptsGranted > MAX_ATTEMPTS) {
            throw new ValidationException("Choose between " + MIN_ATTEMPTS + " and " + MAX_ATTEMPTS + " attempts");
        }
        return new VerificationGrant(
                tenancyId, ownerUserId, propertyId, tenantUserId, serviceCode, attemptsGranted, createdByUserId);
    }

    /** Tries left for the tenant to use. */
    public int attemptsRemaining() {
        return Math.max(0, attemptsGranted - attemptsUsed);
    }

    public boolean isOpen() {
        return status == VerificationGrantStatus.PENDING;
    }

    /**
     * Takes one try.
     *
     * <p>Called when an attempt STARTS, not when it finishes. A tenant who
     * abandons a check halfway has still had the provider send them an OTP, and
     * leaving the count untouched would let one tenant generate OTPs forever.
     */
    public void useAttempt() {
        if (!isOpen()) {
            throw new ValidationException("This check is already finished");
        }
        if (attemptsRemaining() <= 0) {
            throw new ValidationException("No attempts left. Ask the property owner for more.");
        }
        this.attemptsUsed += 1;
        if (attemptsRemaining() == 0) {
            // Provisional: a success arriving for the attempt just started will
            // move it to VERIFIED. Marking it here means a tenant who walks away
            // mid-OTP leaves a grant that reads as finished rather than as one
            // still waiting on somebody.
            this.status = VerificationGrantStatus.EXHAUSTED;
        }
    }

    /**
     * Gives back an attempt that never cost anything.
     *
     * <p>For a request the provider refused outright — a bad configuration on
     * our side, an outage on theirs. The owner was not billed for it, so the
     * tenant should not have paid for it in tries either. The cooldown is what
     * stops somebody generating refusals on purpose.
     */
    public void restoreAttempt() {
        if (attemptsUsed <= 0) {
            return;
        }
        this.attemptsUsed -= 1;
        if (status == VerificationGrantStatus.EXHAUSTED) {
            // It was only exhausted because of the try we are giving back.
            this.status = VerificationGrantStatus.PENDING;
        }
    }

    /**
     * The provider confirmed them.
     *
     * @param nameMatchScore how closely the returned name matched the tenancy's
     *                       own, between 0 and 1
     */
    public void markVerified(
            String verifiedName,
            LocalDate verifiedDob,
            String maskedIdLastFour,
            BigDecimal nameMatchScore,
            String verifiedAddress,
            String verifiedAddressPincode,
            Boolean phoneMatched,
            boolean adultAtVerification,
            Instant verifiedAt) {
        this.status = VerificationGrantStatus.VERIFIED;
        this.verifiedName = verifiedName;
        this.verifiedDob = verifiedDob;
        this.maskedIdLastFour = maskedIdLastFour;
        this.nameMatchScore = nameMatchScore;
        // Reaching here means the name matched: a mismatch never becomes a
        // verified grant. Recorded anyway, so a row is readable without
        // knowing that rule.
        this.nameMatched = true;
        this.verifiedAddress = verifiedAddress;
        this.verifiedAddressPincode = verifiedAddressPincode;
        this.phoneMatched = phoneMatched;
        this.adultAtVerification = adultAtVerification;
        this.verifiedAt = verifiedAt;
    }

    /**
     * Records what a failed attempt learned, without passing the grant.
     *
     * <p>A name that did not match is the most useful thing we can tell an
     * owner, and losing it would leave them staring at "failed" with nothing to
     * act on.
     */
    public void recordFailedMatch(String returnedName, BigDecimal nameMatchScore) {
        this.verifiedName = returnedName;
        this.nameMatchScore = nameMatchScore;
        this.nameMatched = false;
    }

    /**
     * The tenancy went away before the tenant finished.
     *
     * <p>Costs nothing. Unused attempts were never charged, because the
     * provider never ran them.
     */
    public void cancel() {
        if (status == VerificationGrantStatus.VERIFIED) {
            // A completed check is a fact about a person, not a line item. It
            // survives the tenancy that paid for it.
            return;
        }
        this.status = VerificationGrantStatus.CANCELLED;
    }

    /** Grants more tries after the last ones ran out, at the owner's cost. */
    public void grantMoreAttempts(int additional) {
        if (status == VerificationGrantStatus.VERIFIED) {
            throw new ValidationException("This check has already passed");
        }
        if (additional < MIN_ATTEMPTS || attemptsGranted + additional > MAX_ATTEMPTS * 2) {
            throw new ValidationException("Choose between " + MIN_ATTEMPTS + " and " + MAX_ATTEMPTS + " attempts");
        }
        this.attemptsGranted += additional;
        this.status = VerificationGrantStatus.PENDING;
    }
}
