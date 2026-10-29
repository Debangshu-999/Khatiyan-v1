package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.AgreementTermInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.TenantDetailsInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.VerificationOrderInput;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Brings a person already living in a running PG onto Khatiyan from their next
 * bill (existing-tenant onboarding, P1.1, 2026-10-28).
 *
 * <p>Ordinary monthly onboarding with what came before kept:
 * <ul>
 * <li>{@code movedInOn}, when they really moved in. The stay itself starts on
 * {@code firstBillOn}, and tenure counts from the move-in.</li>
 * <li>{@code depositHeldPaise}, the deposit the owner holds now (typed, never
 * the property policy: part may have been used before Khatiyan). It is opened in the
 * ledger as carried over and never billed.</li>
 * <li>{@code openingDuesPaise}, what they owed at the switch, raised as an
 * opening one-off bill once billing starts.</li>
 * <li>The agreement: {@code PAPER} keeps their paper agreement, with its photos
 * on file and nothing to sign in the app, so the stay starts now.
 * {@code IN_APP} issues a Khatiyan deed they sign, as any onboarding does.</li>
 * </ul>
 *
 * <p>On paper the tenant's address may be left for them to fill in themselves:
 * no deed names them by it.
 */
public record OnboardExistingTenantRequest(

    @NotBlank
    @Size(max = 20)
    String tenantPhone,

    @Size(max = 120)
    String tenantName,

    @NotNull
    UUID propertyId,

    @NotNull
    UUID roomId,

    @NotNull(message = "Enter their current rent")
    @Min(value = 1, message = "Enter their current rent")
    Long rentAmountPaise,

    @NotNull(message = "Enter the deposit you hold for them now, 0 if none")
    @Min(value = 0, message = "The deposit held cannot be negative")
    Long depositHeldPaise,

    @NotNull(message = "Enter the date they moved in")
    LocalDate movedInOn,

    @NotNull(message = "Pick the day of their first Khatiyan bill")
    LocalDate firstBillOn,

    @Min(value = 1, message = "Dues at the switch must be more than zero, or left out")
    Long openingDuesPaise,

    @Size(max = 120, message = "Keep the dues note under 120 characters")
    String openingDuesNote,

    @Valid IdCheckDeclarationInput idCheck,

    String idCheckStatementText,

    @Valid List<VerificationOrderInput> verification,

    /**
     * The owner declares their identity was verified before Khatiyan: the third
     * route, beside checking an ID now or ordering a check (user, 2026-10-28).
     */
    Boolean verifiedBefore,

    /** The declaration's wording as shown, when {@code verifiedBefore}. */
    String verifiedBeforeStatementText,

    @Valid DeviceFingerprintInput device,

    /** Required for a deed signed in the app. Optional on paper, for the tenant to fill in. */
    @Valid TenantDetailsInput tenant,

    @NotNull(message = "Choose how their agreement carries over")
    AgreementKind agreement,

    /** The paper agreement's photos: 1 to 10 on {@code PAPER}, none on {@code IN_APP}. */
    @Size(max = 10, message = "Add at most 10 files of the paper agreement")
    List<@NotBlank @Size(max = 600) String> paperAgreementPhotoUrls,

    /** The deed's clauses on {@code IN_APP}, as on ordinary onboarding. Ignored on paper. */
    AgreementTemplate template,

    /** The term from the first Khatiyan bill: on paper, what is left of the paper agreement. */
    @Valid AgreementTermInput term,

    /** The room's condition at the switch (2026-10-29). Optional. */
    @Valid com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput moveInChecklist,

    /** This stay's own move-out checklist (2026-10-29). Null keeps the property's. */
    @Size(max = 30, message = "A move-out checklist can have at most 30 items")
    java.util.List<@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 120) String> moveOutChecklist
) {

    /** Without a move-out checklist. */
    public OnboardExistingTenantRequest(
            String tenantPhone, String tenantName, UUID propertyId, UUID roomId,
            Long rentAmountPaise, Long depositHeldPaise, LocalDate movedInOn, LocalDate firstBillOn,
            Long openingDuesPaise, String openingDuesNote,
            IdCheckDeclarationInput idCheck, String idCheckStatementText,
            List<VerificationOrderInput> verification, Boolean verifiedBefore, String verifiedBeforeStatementText,
            DeviceFingerprintInput device, TenantDetailsInput tenant, AgreementKind agreement,
            List<String> paperAgreementPhotoUrls, AgreementTemplate template, AgreementTermInput term,
            com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput moveInChecklist) {
        this(tenantPhone, tenantName, propertyId, roomId, rentAmountPaise, depositHeldPaise, movedInOn, firstBillOn,
                openingDuesPaise, openingDuesNote, idCheck, idCheckStatementText, verification, verifiedBefore,
                verifiedBeforeStatementText, device, tenant, agreement, paperAgreementPhotoUrls, template, term,
                moveInChecklist, null);
    }

    /** Without a move-in checklist. */
    public OnboardExistingTenantRequest(
            String tenantPhone, String tenantName, UUID propertyId, UUID roomId,
            Long rentAmountPaise, Long depositHeldPaise, LocalDate movedInOn, LocalDate firstBillOn,
            Long openingDuesPaise, String openingDuesNote,
            IdCheckDeclarationInput idCheck, String idCheckStatementText,
            List<VerificationOrderInput> verification, Boolean verifiedBefore, String verifiedBeforeStatementText,
            DeviceFingerprintInput device, TenantDetailsInput tenant, AgreementKind agreement,
            List<String> paperAgreementPhotoUrls, AgreementTemplate template, AgreementTermInput term) {
        this(tenantPhone, tenantName, propertyId, roomId, rentAmountPaise, depositHeldPaise, movedInOn, firstBillOn,
                openingDuesPaise, openingDuesNote, idCheck, idCheckStatementText, verification, verifiedBefore,
                verifiedBeforeStatementText, device, tenant, agreement, paperAgreementPhotoUrls, template, term, null, null);
    }

    /** How their agreement carries over. */
    public enum AgreementKind {
        /** The paper agreement stays the agreement, its photos on file. Nothing is signed in the app. */
        PAPER,
        /** A Khatiyan deed, signed in the app as on any onboarding. */
        IN_APP
    }

    public boolean onPaper() {
        return agreement == AgreementKind.PAPER;
    }

    public boolean declaredVerifiedBefore() {
        return Boolean.TRUE.equals(verifiedBefore);
    }

    /** The ordinary onboarding request this one carries, starting on the first Khatiyan bill. */
    public OnboardTenancyWithAgreementRequest asOnboarding() {
        return new OnboardTenancyWithAgreementRequest(
                tenantPhone, tenantName, propertyId, roomId,
                rentAmountPaise, depositHeldPaise == null ? 0L : depositHeldPaise,
                firstBillOn,
                idCheck, idCheckStatementText, verification, device, tenant,
                onPaper() ? null : template,
                term,
                moveInChecklist,
                moveOutChecklist);
    }
}
