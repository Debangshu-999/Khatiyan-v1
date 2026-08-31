package com.khatiyan.a_auth.model;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Objects;
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
 * Application user owned by the auth module.
 *
 * <p>A user represents an owner, manager, or tenant identified by
 * phone number. The auth module owns credential state such as PIN hash,
 * phone verification, active status, active tenancy state, credential version,
 * and profile metadata such as the Cloudinary profile photo reference. Other
 * modules should access user information through {@code AuthModule} rather
 * than importing this entity directly.
 */
@Entity
@Table(name = "users", schema = "auth")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 15)
    private String phone;

    @Column(name = "full_name", nullable = false, length = 120)
    private String fullName;

    @Column(length = 254)
    private String email;

    /**
     * Where this person actually lives, as opposed to where they are staying.
     *
     * <p>On the user rather than the tenancy because every role needs one: an
     * agreement names both parties by their permanent address, and the Landlord
     * is an owner, not a tenant.
     *
     * <p>Nullable for every role. Existing accounts have none, and a profile
     * screen that refused to save until four new fields were filled would lock
     * people out of their own settings; onboarding enforces its own requirements
     * instead.
     */
    @Column(name = "permanent_address", length = 300)
    private String permanentAddress;

    @Column(name = "permanent_address_pincode", length = 6)
    private String permanentAddressPincode;

    /**
     * Stored as a birth date, never as an age.
     *
     * <p>A deed prints "Age: 34 Years". Storing 34 makes that wrong within a year
     * and wrong on every agreement issued afterwards, so the age is computed at
     * the moment a document is assembled.
     */
    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Gender gender;

    @Column(name = "profile_photo_url", length = 500)
    private String profilePhotoUrl;

    @Column(name = "profile_photo_public_id", length = 255)
    private String profilePhotoPublicId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Column(name = "pin_hash")
    private String pinHash;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "is_phone_verified", nullable = false)
    private boolean phoneVerified;

    @Column(name = "is_email_verified", nullable = false)
    private boolean emailVerified;

    @Column(name = "email_verification_token_hash", length = 64)
    private String emailVerificationTokenHash;

    @Column(name = "email_verification_expires_at")
    private Instant emailVerificationExpiresAt;

    @Column(name = "is_profile_completed", nullable = false)
    private boolean profileCompleted;

    @Column(name = "is_active_tenant", nullable = false)
    private boolean activeTenant;

    @Column(name = "credential_version", nullable = false)
    private int credentialVersion;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "login_locked", nullable = false)
    private boolean loginLocked;

    @Column(name = "login_locked_at")
    private Instant loginLockedAt;

    @Column(name = "login_locked_until")
    private Instant loginLockedUntil;

    @Column(name = "last_failed_login_at")
    private Instant lastFailedLoginAt;

    @Column(name = "last_successful_login_at")
    private Instant lastSuccessfulLoginAt;

    private User(String phone, String fullName, UserRole role) {
        this.id = UUID.randomUUID();
        this.phone = phone;
        this.fullName = fullName;
        this.role = role;
        this.active = true;
        this.phoneVerified = false;
        this.emailVerified = false;
        this.profileCompleted = false;
        this.activeTenant = false;
        this.credentialVersion = 0;
        this.failedLoginAttempts = 0;
        this.loginLocked = false;
    }

    public static User create(String phone, String fullName, UserRole role) {
        return new User(phone, fullName, role);
    }

    public void updateProfile(String fullName) {
        this.fullName = fullName;
        this.profileCompleted = true;
    }

    /**
     * The person's own edit of their identity details.
     *
     * <p>Blanks clear. This is somebody editing their own profile, so an empty
     * field means they removed it — unlike {@link #fillMissingIdentity}, which is
     * somebody else supplying what they know.
     */
    public void updateIdentity(
            String permanentAddress, String permanentAddressPincode, LocalDate dateOfBirth, Gender gender) {
        this.permanentAddress = blankToNull(permanentAddress);
        this.permanentAddressPincode = blankToNull(permanentAddressPincode);
        this.dateOfBirth = dateOfBirth;
        this.gender = gender;
    }

    /**
     * Fills only what is missing, from an owner onboarding this tenant.
     *
     * <p>Deliberately one-directional. An owner typing into an onboarding form is
     * not editing the tenant's profile, and a form that prefilled from the account
     * and then wrote back would let them silently overwrite an address the tenant
     * set themselves. Fields already holding a value are left exactly as they are;
     * the screen renders those read-only to match.
     *
     * @return true when anything was actually written
     */
    public boolean fillMissingIdentity(
            String permanentAddress, String permanentAddressPincode, LocalDate dateOfBirth, Gender gender) {
        boolean changed = false;
        if (isBlank(this.permanentAddress) && !isBlank(permanentAddress)) {
            this.permanentAddress = permanentAddress.trim();
            changed = true;
        }
        if (isBlank(this.permanentAddressPincode) && !isBlank(permanentAddressPincode)) {
            this.permanentAddressPincode = permanentAddressPincode.trim();
            changed = true;
        }
        if (this.dateOfBirth == null && dateOfBirth != null) {
            this.dateOfBirth = dateOfBirth;
            changed = true;
        }
        if (this.gender == null && gender != null) {
            this.gender = gender;
            changed = true;
        }
        return changed;
    }

    /** Age in whole years on a given day, or null when no birth date is held. */
    public Integer ageOn(LocalDate on) {
        return dateOfBirth == null ? null : Period.between(dateOfBirth, on).getYears();
    }

    /**
     * Whether this person can be named as the Landlord of an agreement.
     *
     * <p>A name, a VERIFIED email, and a permanent address. The email has to be
     * verified rather than merely present because it is printed on the deed as the
     * Landlord's contact — an address nobody has proved control of is not a way to
     * reach the other party to a contract.
     *
     * <p>Age and gender are NOT required. They are optional on a profile and the
     * deed omits them when absent, so demanding them would gate onboarding on
     * details the document does not need.
     */
    public boolean hasAgreementIdentity() {
        return !isBlank(fullName)
                && emailVerified
                && !isBlank(permanentAddress)
                && !isBlank(permanentAddressPincode);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }
    /**
     * Sets the recovery address, dropping verification only when it changes.
     *
     * <p>Verification asserts control of an address at a moment in time, so a
     * genuinely different address must be proved again — including one that was
     * verified before and is being returned to, since addresses get reassigned
     * and this one is the PIN-reset channel.
     *
     * <p>But re-saving the address already on file proves nothing new and must
     * not cost the verification. This used to clear the flag unconditionally,
     * so opening the field and saving without editing — or correcting nothing
     * more than the capitalisation — silently unverified an address that had
     * not changed at all. Comparison is on the normalised form for that reason.
     */
    public void updateRecoveryEmail(String email) {
        String normalized = normalizeEmail(email);
        if (Objects.equals(this.email, normalized)) {
            return;
        }
        this.email = normalized;
        this.emailVerified = false;
    }

    public void beginEmailVerification(String tokenHash, Instant expiresAt) {
        this.emailVerificationTokenHash = tokenHash;
        this.emailVerificationExpiresAt = expiresAt;
    }

    public boolean hasActiveEmailVerificationToken(String tokenHash, Instant now) {
        return !emailVerified
                && tokenHash != null
                && tokenHash.equals(emailVerificationTokenHash)
                && emailVerificationExpiresAt != null
                && emailVerificationExpiresAt.isAfter(now);
    }

    public void markEmailVerified() {
        if (this.email == null || this.email.isBlank()) {
            return;
        }
        this.emailVerified = true;
    }

    private String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        return email.trim().toLowerCase();
    }

    public void updateProfilePhoto(String profilePhotoUrl, String profilePhotoPublicId) {
        this.profilePhotoUrl = profilePhotoUrl;
        this.profilePhotoPublicId = profilePhotoPublicId;
    }

    public void clearProfilePhoto() {
        this.profilePhotoUrl = null;
        this.profilePhotoPublicId = null;
    }

    public void markActiveTenant() {
        this.activeTenant = true;
    }

    public void clearActiveTenant() {
        this.activeTenant = false;
    }

    public void setPin(String pinHash) {
        this.pinHash = pinHash;
        this.phoneVerified = true;
        this.credentialVersion++;
        clearLoginLock();
    }

    public void markPhoneVerified() {
        this.phoneVerified = true;
    }

    public boolean hasPin() {
        return pinHash != null && !pinHash.isBlank();
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    public void recordSuccessfulLogin(Instant now) {
        this.lastSuccessfulLoginAt = now;
        clearLoginLock();
    }

    public void recordFailedLoginAttempt(int lockThreshold, Duration lockDuration, Instant now) {
        this.failedLoginAttempts++;
        this.lastFailedLoginAt = now;

        if (this.failedLoginAttempts >= lockThreshold && !lockDuration.isZero() && !lockDuration.isNegative()) {
            this.loginLocked = true;
            this.loginLockedAt = now;
            this.loginLockedUntil = now.plus(lockDuration);
        }
    }

    public boolean isLoginTemporarilyLocked(Instant now) {
        return loginLocked && loginLockedUntil != null && loginLockedUntil.isAfter(now);
    }

    public void releaseExpiredLoginLock(Instant now) {
        if (loginLocked && loginLockedUntil != null && !loginLockedUntil.isAfter(now)) {
            this.loginLocked = false;
            this.loginLockedAt = null;
            this.loginLockedUntil = null;
        }
    }

    public void clearLoginLock() {
        this.failedLoginAttempts = 0;
        this.loginLocked = false;
        this.loginLockedAt = null;
        this.loginLockedUntil = null;
    }
}
