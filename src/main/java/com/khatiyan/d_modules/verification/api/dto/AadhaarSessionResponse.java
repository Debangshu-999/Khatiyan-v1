package com.khatiyan.d_modules.verification.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.verification.model.VerificationAttempt;

/**
 * An Aadhaar App session is open.
 *
 * @param intentUrl the link the app opens to hand the tenant to the Aadhaar App
 * @param expiresAt when the session closes unanswered
 */
public record AadhaarSessionResponse(UUID attemptId, String intentUrl, Instant expiresAt) {

    public static AadhaarSessionResponse from(VerificationAttempt attempt) {
        return new AadhaarSessionResponse(attempt.getId(), attempt.getIntentUrl(), attempt.getSessionExpiresAt());
    }
}
