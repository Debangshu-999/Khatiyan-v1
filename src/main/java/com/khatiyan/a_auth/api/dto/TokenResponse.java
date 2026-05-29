package com.khatiyan.a_auth.api.dto;

/**
 * Response returned after successful authentication.
 *
 * <p>The access token is a JWT. Clients should send it in the
 * Authorization header as {@code Bearer <token>}.
 */
public record TokenResponse(
    String accessToken,
    String tokenType,
    long expiresInSeconds,
    UserSummaryResponse user
) {}
