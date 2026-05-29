package com.khatiyan.a_auth.api.dto;

import java.util.UUID;

/**
 * Response returned after a successful OTP verification check.
 *
 * <p>{@code mustSetPin} tells the client whether to show the first-time
 * PIN setup screen or continue to the normal login flow.
 */
public record OtpVerifyResponse(
    UUID userId,
    boolean mustSetPin
) {}
