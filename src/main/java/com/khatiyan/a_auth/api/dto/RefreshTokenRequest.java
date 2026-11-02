package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;

/** Swaps a refresh token for a new access token and a new refresh token. */
public record RefreshTokenRequest(@NotBlank String refreshToken) {
}
