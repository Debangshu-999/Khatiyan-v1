package com.khatiyan.a_auth.api.dto;

/**
 * Response returned after successful authentication.
 *
 * <p>The access token is a short-lived JWT. Clients should send it in the
 * Authorization header as {@code Bearer <token>}. The refresh token renews it, works
 * once, and is replaced by the one in the reply.
 */
public record TokenResponse(
    String accessToken,
    String tokenType,
    long expiresInSeconds,
    UserSummaryResponse user,
    String refreshToken
) {}
