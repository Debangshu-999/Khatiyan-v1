package com.khatiyan.d_modules.booking.api.dto;

import java.util.List;

import com.khatiyan.d_modules.compliance.api.dto.DeviceFingerprintInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.TenantDetailsInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.VerificationOrderInput;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;

/**
 * What the person converting a booking takes from the tenant on arrival.
 *
 * <p>Only what a booking does not already hold. The room, the rent, the
 * deposit, the term and the phone number are the booking's own and are never
 * sent here: the stay is built from what was agreed, whatever the screen says.
 *
 * <p>The identity route is the same choice ordinary onboarding gives: the
 * person's own ID check, or an ordered verification, and exactly one of them.
 *
 * @param tenant        the tenant's permanent address and PIN code, which the
 *                      agreement names them by
 * @param earlyExitRule optional, for a fixed term, as on ordinary onboarding
 */
public record ConvertBookingRequest(
        IdCheckDeclarationInput idCheck,
        String idCheckStatementText,
        List<VerificationOrderInput> verification,
        DeviceFingerprintInput device,
        TenantDetailsInput tenant,
        String earlyExitRule) {
}
