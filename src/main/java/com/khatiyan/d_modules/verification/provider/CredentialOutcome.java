package com.khatiyan.d_modules.verification.provider;

import java.time.LocalDate;

import com.khatiyan.a_auth.model.Gender;

/**
 * What the Aadhaar App shared, as the provider reported it.
 *
 * <p>Deliberately without the photograph (providers send it as a link, and we
 * never follow it) and without the address (not part of verification, owner's
 * decision 2026-09-27). Nothing here is the full Aadhaar number either.
 *
 * @param succeeded      the tenant consented and the credential verified
 * @param referenceId    ours, echoed back; checked against the attempt
 * @param ageAbove18     the credential's own flag, a cross-check on the date of birth
 * @param faceMatched    the Aadhaar App's face check; null when it did not run
 * @param maskedMobile   e.g. "XXXXX-X9999"; reported, never enforced
 * @param maskedLastFour last four of the Aadhaar, when the credential carries them
 * @param failureReason  in words a tenant can read, when not succeeded
 */
public record CredentialOutcome(
        boolean succeeded,
        String referenceId,
        String name,
        LocalDate dateOfBirth,
        Gender gender,
        String maskedMobile,
        String maskedLastFour,
        Boolean ageAbove18,
        Boolean faceMatched,
        String failureReason) {

    public static CredentialOutcome declined(String referenceId, String failureReason) {
        return new CredentialOutcome(false, referenceId, null, null, null, null, null, null, null, failureReason);
    }
}
