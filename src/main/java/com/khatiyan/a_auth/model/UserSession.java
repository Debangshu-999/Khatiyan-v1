package com.khatiyan.a_auth.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One issued access token, recorded so it can be listed and revoked on its own.
 *
 * <p>Deliberately NOT a {@code BaseEntity}: that contributes {@code updated_at},
 * and this row's lifecycle is told by three columns of its own — when it was
 * created, when it was last used, and when it was revoked. A generic
 * "last touched" stamp alongside those would be a fourth date that answers none
 * of the questions the device list asks.
 */
@Entity
@Table(name = "user_sessions", schema = "auth")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserSession {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /** The token's {@code jti} claim — the link from a bearer token to this row. */
    @Column(nullable = false, updatable = false)
    private UUID jti;

    /** Client-supplied and therefore untrusted. Shown, never acted on. */
    @Column(name = "device_label", length = 120)
    private String deviceLabel;

    @Column(length = 20)
    private String platform;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    /** When the token stops being valid regardless of revocation. */
    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    private UserSession(
            UUID userId,
            UUID jti,
            String deviceLabel,
            String platform,
            Instant now,
            Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.jti = jti;
        this.deviceLabel = deviceLabel;
        this.platform = platform;
        this.createdAt = now;
        this.lastSeenAt = now;
        this.expiresAt = expiresAt;
    }

    public static UserSession opened(
            UUID userId,
            UUID jti,
            String deviceLabel,
            String platform,
            Instant now,
            Instant expiresAt) {
        return new UserSession(userId, jti, deviceLabel, platform, now, expiresAt);
    }

    /**
     * Ends this session. Idempotent: revoking twice keeps the first timestamp,
     * because when it was ended is a fact and the second call is a no-op.
     */
    public void revoke(Instant now) {
        if (this.revokedAt == null) {
            this.revokedAt = now;
        }
    }

    public void touch(Instant now) {
        this.lastSeenAt = now;
    }

    public boolean isRevoked() {
        return this.revokedAt != null;
    }

    /** Live means not revoked and not past its token's expiry. */
    public boolean isLive(Instant now) {
        return !isRevoked() && this.expiresAt.isAfter(now);
    }
}
