package com.khatiyan.d_modules.verification.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.verification.model.VerificationGrant;

/**
 * One ordered check, as both sides see it.
 *
 * <p>The same shape for the owner and the tenant on purpose — they are looking
 * at the same fact — and it carries nothing the owner may not see. There is no
 * Aadhaar number here because there is none anywhere: the masked fragment is
 * all that was ever kept.
 *
 * @param tenancyId        the stay that ordered it. A tenant can have checks
 *                         from more than one stay, and a screen shows only
 *                         its own.
 * @param nameMatched      null while nothing has been tried
 * @param phoneMatched     whether the Aadhaar-linked mobile is the phone they
 *                         signed in with. Null means we could not tell, which
 *                         is not the same as no, and false is a fact rather
 *                         than a failure.
 * @param verifiedGender   from the Aadhaar App only. Null for the OTP check,
 *                         whose record carries no gender.
 * @param faceMatched      the Aadhaar App's face check. Null when none ran.
 */
public record VerificationGrantResponse(
        UUID id,
        UUID tenancyId,
        String serviceCode,
        String status,
        int attemptsGranted,
        int attemptsUsed,
        int attemptsRemaining,
        Instant verifiedAt,
        String verifiedName,
        String maskedIdLastFour,
        Boolean nameMatched,
        Boolean phoneMatched,
        Boolean adultAtVerification,
        String verifiedGender,
        Boolean faceMatched) {

    public static VerificationGrantResponse from(VerificationGrant grant) {
        return new VerificationGrantResponse(
                grant.getId(),
                grant.getTenancyId(),
                grant.getServiceCode().name(),
                grant.getStatus().name(),
                grant.getAttemptsGranted(),
                grant.getAttemptsUsed(),
                grant.attemptsRemaining(),
                grant.getVerifiedAt(),
                grant.getVerifiedName(),
                grant.getMaskedIdLastFour(),
                grant.getNameMatched(),
                grant.getPhoneMatched(),
                grant.getAdultAtVerification(),
                grant.getVerifiedGender() == null ? null : grant.getVerifiedGender().name(),
                grant.getFaceMatched());
    }
}
