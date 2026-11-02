package com.khatiyan.d_modules.compliance.api.dto;

import java.time.Instant;
import java.util.List;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckRecord;
import com.khatiyan.d_modules.verification.api.dto.VerificationGrantResponse;
import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.model.VerificationGrantStatus;

/**
 * How this stay's tenant was verified (user, 2026-10-31): the e-KYC checks
 * ordered, the manual ID check, and the declaration carried over from before
 * Khatiyan. All of them empty means nobody verified this tenant, and the profile
 * says so.
 *
 * <p>A cancelled check is left out: nobody asked for it any more, and it says
 * nothing about the person.
 */
public record TenantIdentityChecksResponse(
        List<VerificationGrantResponse> ekycChecks,
        ManualCheck manualCheck,
        boolean verifiedBeforeKhatiyan) {

    /** @param checkedByName null when that account is gone */
    public record ManualCheck(
            String documentType,
            String lastFour,
            Gender gender,
            boolean ageChecked,
            Instant checkedAt,
            String checkedByName) {
    }

    public static TenantIdentityChecksResponse of(
            List<VerificationGrant> grants,
            IdCheckRecord idCheck,
            String checkedByName,
            boolean verifiedBeforeKhatiyan) {
        return new TenantIdentityChecksResponse(
                grants.stream()
                        .filter(grant -> grant.getStatus() != VerificationGrantStatus.CANCELLED)
                        .map(VerificationGrantResponse::from)
                        .toList(),
                idCheck == null
                        ? null
                        : new ManualCheck(
                                idCheck.documentType(),
                                idCheck.lastFour(),
                                idCheck.gender(),
                                idCheck.ageChecked(),
                                idCheck.checkedAt(),
                                checkedByName),
                verifiedBeforeKhatiyan);
    }
}
