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
 * OTP issuance record for phone-based authentication flows.
 *
 * <p>Each row stores a hashed OTP, its purpose, expiry, attempt count,
 * and consumed timestamp. Keeping OTPs as records instead of temporary
 * memory state gives us rate limiting, replay protection, and an audit
 * trail for authentication attempts.
 */
@Entity
@Table(name = "otp_requests", schema = "auth")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OtpRequest extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 15)
    private String phone;

    @Column(name = "request_ip_address", length = 100)
    private String requestIpAddress;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private OtpPurpose purpose;

    @Column(name = "otp_hash", nullable = false)
    private String otpHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    private OtpRequest(
            String phone,
            String requestIpAddress,
            OtpPurpose purpose,
            String otpHash,
            Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.phone = phone;
        this.requestIpAddress = requestIpAddress;
        this.purpose = purpose;
        this.otpHash = otpHash;
        this.expiresAt = expiresAt;
        this.attempts = 0;
    }

    public static OtpRequest issue(
            String phone,
            String requestIpAddress,
            OtpPurpose purpose,
            String otpHash,
            Instant expiresAt) {
        return new OtpRequest(phone, requestIpAddress, purpose, otpHash, expiresAt);
    }

    public void recordFailedAttempt() {
        this.attempts++;
    }

    public void consume(Instant consumedAt) {
        this.consumedAt = consumedAt;
    }

    public boolean isConsumed() {
        return consumedAt != null;
    }
}
