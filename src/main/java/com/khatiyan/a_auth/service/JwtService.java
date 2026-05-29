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
 * <p>Tokens carry the user id, phone, role, and credential version.
 * The credential version lets the auth filter reject older tokens after
 * sensitive changes such as PIN reset or forced logout.
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
        int credentialVersion
    ) {}

    public JwtService(
        @Value("${app.jwt.secret}") String secret,
        @Value("${app.jwt.access-token-expiry-minutes}") long accessTokenExpiryMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(sha256(secret));
        this.accessTokenExpiry = Duration.ofMinutes(accessTokenExpiryMinutes);
    }

    public String issue(User user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(accessTokenExpiry);

        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("phone", user.getPhone())
            .claim("role", user.getRole().name())
            .claim("credentialVersion", user.getCredentialVersion())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .signWith(key)
            .compact();
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
            claims.get("credentialVersion", Integer.class)
        );
    }

    public long accessTokenExpirySeconds() {
        return accessTokenExpiry.toSeconds();
    }

}
