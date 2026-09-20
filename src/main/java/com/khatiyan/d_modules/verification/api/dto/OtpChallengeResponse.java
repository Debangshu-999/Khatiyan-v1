package com.khatiyan.d_modules.verification.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.verification.model.VerificationAttempt;

/**
 * A code is on its way.
 *
 * @param linkedMobileHint the last digits of the number it went to, so the
 *                         tenant knows which handset to look at. Null when the
 *                         provider does not say.
 */
public record OtpChallengeResponse(UUID attemptId, String linkedMobileHint, Instant expiresAt) {

    public static OtpChallengeResponse from(VerificationAttempt attempt) {
        return new OtpChallengeResponse(
                attempt.getId(), attempt.getLinkedMobileHint(), attempt.getOtpExpiresAt());
    }
}
