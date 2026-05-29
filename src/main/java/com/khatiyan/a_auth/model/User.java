package com.khatiyan.a_auth.model;

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
    }

    public void recordFailedLoginAttempt(int maxFailedAttempts, Instant now) {
        this.failedLoginAttempts++;
        this.lastFailedLoginAt = now;

        if (this.failedLoginAttempts >= maxFailedAttempts) {
            this.loginLocked = true;
            this.loginLockedAt = now;
        }
    }

    public void clearLoginLock() {
        this.failedLoginAttempts = 0;
        this.loginLocked = false;
        this.loginLockedAt = null;
    }
}
