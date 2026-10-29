package com.khatiyan.d_modules.booking.api.dto;

import java.util.List;

import com.khatiyan.d_modules.compliance.api.dto.DeviceFingerprintInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.TenantDetailsInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.VerificationOrderInput;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
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
 * @param template      the clauses this stay's deed carries, edited on arrival
 *                      as on ordinary onboarding: the booking agreed the money
 *                      and the term, never the deed (2026-10-28). Null uses the
 *                      property's stored template
 */
public record ConvertBookingRequest(
        IdCheckDeclarationInput idCheck,
        String idCheckStatementText,
        List<VerificationOrderInput> verification,
        DeviceFingerprintInput device,
        TenantDetailsInput tenant,
        String earlyExitRule,
        AgreementTemplate template,
        /** The room's condition at move-in (2026-10-29). Optional. */
        @jakarta.validation.Valid com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput moveInChecklist,
        /** This stay's own move-out checklist (2026-10-29). Null keeps the property's. */
        @jakarta.validation.constraints.Size(max = 30) java.util.List<@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 120) String> moveOutChecklist) {

    /** Without a move-in checklist. */
    public ConvertBookingRequest(IdCheckDeclarationInput idCheck, String idCheckStatementText,
            List<VerificationOrderInput> verification, DeviceFingerprintInput device, TenantDetailsInput tenant,
            String earlyExitRule, AgreementTemplate template) {
        this(idCheck, idCheckStatementText, verification, device, tenant, earlyExitRule, template, null, null);
    }

    /** Without a move-out checklist. */
    public ConvertBookingRequest(IdCheckDeclarationInput idCheck, String idCheckStatementText,
            List<VerificationOrderInput> verification, DeviceFingerprintInput device, TenantDetailsInput tenant,
            String earlyExitRule, AgreementTemplate template,
            com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput moveInChecklist) {
        this(idCheck, idCheckStatementText, verification, device, tenant, earlyExitRule, template, moveInChecklist, null);
    }
}
