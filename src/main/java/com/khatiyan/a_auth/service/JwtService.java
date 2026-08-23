package com.khatiyan.a_auth.service;

import com.khatiyan.a_auth.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and parses JWT access tokens for authenticated users.
 *
 * <p>Tokens carry the user id, phone, role, credential version, and a {@code jti}
 * identifying the single session the token belongs to.
 *
 * <p>The credential version rejects EVERY token a user holds after a sensitive
 * change such as a PIN reset. The {@code jti} is the finer instrument: it names
 * one token, which is what lets a person end the session on a lost phone without
 * ending the one they are using to do it.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final Duration accessTokenExpiry;

    private byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    public record ParsedToken(
        UUID userId,
        String phone,
        String role,
        int credentialVersion,
        /**
         * Session id claim. Null for a token issued before sessions existed —
         * those stay valid until they expire on their own rather than signing
         * everybody out on deploy, so every reader must tolerate the absence.
         */
        UUID sessionId
    ) {}

    /** An issued token and the session identity baked into it. */
    public record IssuedToken(String token, UUID sessionId, Instant expiresAt) {}

    public JwtService(
        @Value("${app.jwt.secret}") String secret,
        @Value("${app.jwt.access-token-expiry-minutes}") long accessTokenExpiryMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(sha256(secret));
        this.accessTokenExpiry = Duration.ofMinutes(accessTokenExpiryMinutes);
    }

    public IssuedToken issue(User user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(accessTokenExpiry);
        UUID sessionId = UUID.randomUUID();

        String token = Jwts.builder()
            .id(sessionId.toString())
            .subject(user.getId().toString())
            .claim("phone", user.getPhone())
            .claim("role", user.getRole().name())
            .claim("credentialVersion", user.getCredentialVersion())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .signWith(key)
            .compact();

        return new IssuedToken(token, sessionId, expiresAt);
    }

    public ParsedToken parse(String token) {
        Claims claims = Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();

        return new ParsedToken(
            UUID.fromString(claims.getSubject()),
            claims.get("phone", String.class),
            claims.get("role", String.class),
            claims.get("credentialVersion", Integer.class),
            parseSessionId(claims.getId())
        );
    }

    public long accessTokenExpirySeconds() {
        return accessTokenExpiry.toSeconds();
    }

    /**
     * A jti that is missing or not a UUID reads as "no session", not as a broken
     * token. Tokens minted before this claim existed are still perfectly valid
     * signatures, and refusing them would sign out everyone on the deploy that
     * shipped sessions.
     */
    private UUID parseSessionId(String rawId) {
        if (rawId == null || rawId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(rawId);
        } catch (IllegalArgumentException notAUuid) {
            return null;
        }
    }

}
