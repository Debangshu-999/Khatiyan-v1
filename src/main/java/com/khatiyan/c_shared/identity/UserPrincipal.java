package com.khatiyan.c_shared.identity;

import java.util.UUID;

/**
 * Represents the authenticated user attached to the security context.
 *
 * Populated by the auth module's JWT filter once a request is
 * authenticated. Other modules read this through Spring Security
 * to identify the caller.
 */
public record UserPrincipal(
    UUID userId,
    String phone,
    String role,
    /**
     * The session this request is authenticated by — the token’s jti.
     *
     * <p>Lets a caller be told apart from its own other sessions, which is what
     * marks one row “This device” and stops the device list from signing you out
     * of the very session you are using to read it.
     *
     * <p>Null for a token minted before sessions existed; those stay valid until
     * they expire, so readers must tolerate it.
     */
    UUID sessionId
) {}


