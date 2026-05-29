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
    String role
) {}


