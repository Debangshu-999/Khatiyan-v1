package com.khatiyan.a_auth.model;

import java.util.UUID;

/**
 * What the auth filter needs to know about a user, and nothing else
 * (2026-10-18).
 *
 * <p>Cached so a signed-in request need not read the user row. Only an ACTIVE
 * user is ever one of these. An inactive or missing user is cached as absent.
 */
public record AuthUser(UUID id, String phone, UserRole role, int credentialVersion) {

    public static AuthUser of(User user) {
        return new AuthUser(user.getId(), user.getPhone(), user.getRole(), user.getCredentialVersion());
    }
}
