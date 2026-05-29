package com.khatiyan.a_auth.model;

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
 * Durable record of a PIN login attempt.
 *
 * <p>Bucket4j handles fast in-memory throttling while the app is running.
 * This table keeps a restart-safe login attempt trail so phone/IP windows
 * still protect accounts after an application restart.
 */
@Entity
@Table(name = "login_attempts", schema = "auth")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoginAttempt extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 15)
    private String phone;

    @Column(name = "ip_address", length = 100)
    private String ipAddress;

    @Column(nullable = false)
    private boolean successful;

    @Enumerated(EnumType.STRING)
    @Column(name = "failure_reason", length = 50)
    private LoginFailureReason failureReason;

    private LoginAttempt(
            String phone,
            String ipAddress,
            boolean successful,
            LoginFailureReason failureReason) {
        this.id = UUID.randomUUID();
        this.phone = phone;
        this.ipAddress = ipAddress;
        this.successful = successful;
        this.failureReason = failureReason;
    }

    public static LoginAttempt success(String phone, String ipAddress) {
        return new LoginAttempt(phone, ipAddress, true, null);
    }

    public static LoginAttempt failure(String phone, String ipAddress, LoginFailureReason reason) {
        return new LoginAttempt(phone, ipAddress, false, reason);
    }
}
