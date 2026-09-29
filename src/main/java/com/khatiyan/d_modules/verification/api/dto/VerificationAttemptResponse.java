package com.khatiyan.d_modules.verification.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.verification.service.VerificationService.AttemptStatus;

/**
 * Where one attempt stands, for the app to poll when the tenant comes back
 * from the Aadhaar App.
 *
 * @param status        AWAITING_CONSENT while the session is still open
 * @param failureReason in words a tenant can read, when it did not pass
 */
public record VerificationAttemptResponse(
        UUID attemptId, String status, String failureReason, VerificationGrantResponse grant) {

    public static VerificationAttemptResponse from(AttemptStatus status) {
        return new VerificationAttemptResponse(
                status.attempt().getId(),
                status.attempt().getStatus().name(),
                status.attempt().getFailureReason(),
                VerificationGrantResponse.from(status.grant()));
    }
}
