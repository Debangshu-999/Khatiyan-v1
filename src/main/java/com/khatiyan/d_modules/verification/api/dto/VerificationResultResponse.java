package com.khatiyan.d_modules.verification.api.dto;

import com.khatiyan.d_modules.verification.service.VerificationResult;

/**
 * What submitting a code achieved.
 *
 * <p>A 200 with {@code verified: false} rather than an error status. A wrong
 * code is an ordinary outcome of asking somebody to read a text message, and
 * the app needs the grant back either way to know how many tries are left.
 */
public record VerificationResultResponse(boolean verified, String message, VerificationGrantResponse grant) {

    public static VerificationResultResponse from(VerificationResult result) {
        return new VerificationResultResponse(
                result.verified(),
                result.message(),
                result.grant() == null ? null : VerificationGrantResponse.from(result.grant()));
    }
}
