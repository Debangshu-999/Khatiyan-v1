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
 * One device's sign-in, recorded so it can be listed and revoked on its own. Every
 * access token issued to it carries its {@code jti}.
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

    /** The tokens' {@code jti} claim — the link from a bearer token to this row. */
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

    /** When the session ends regardless of revocation. Each renewal moves it on. */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** SHA-256 of the refresh token in force. Never the token itself. */
    @Column(name = "refresh_token_hash", length = 64)
    private String refreshTokenHash;

    @Column(name = "previous_refresh_token_hash", length = 64)
    private String previousRefreshTokenHash;

    @Column(name = "previous_refresh_rotated_at")
    private Instant previousRefreshRotatedAt;

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

    public static UserSession opened(
            UUID userId,
            UUID jti,
            String deviceLabel,
            String platform,
            Instant now,
            Instant expiresAt,
            String refreshTokenHash) {
        UserSession session = new UserSession(userId, jti, deviceLabel, platform, now, expiresAt);
        session.refreshTokenHash = refreshTokenHash;
        return session;
    }

    /** The token in force was used. The one presented stays known for a moment, as the previous one. */
    public void rotateRefreshToken(String newHash, Instant now, Instant newExpiresAt) {
        this.previousRefreshTokenHash = this.refreshTokenHash;
        this.previousRefreshRotatedAt = now;
        this.refreshTokenHash = newHash;
        this.expiresAt = newExpiresAt;
    }

    /**
     * The previous token came back in its grace period: the reply to its first use was lost.
     * That window is not extended, or a replay could keep it open.
     */
    public void replaceRefreshTokenInGrace(String newHash, Instant newExpiresAt) {
        this.refreshTokenHash = newHash;
        this.expiresAt = newExpiresAt;
    }

    public boolean withinRefreshGrace(Instant now, java.time.Duration grace) {
        return previousRefreshRotatedAt != null && previousRefreshRotatedAt.plus(grace).isAfter(now);
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
