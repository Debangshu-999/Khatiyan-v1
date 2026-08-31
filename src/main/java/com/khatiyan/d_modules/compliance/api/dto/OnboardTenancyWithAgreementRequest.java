package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Agreement-path onboarding: the same fields the plain monthly onboarding takes,
 * plus optional per-tenancy custom prose clauses (system rules are always
 * assembled server-side and are not editable). Null {@code customClauses} means
 * "use the property's default custom clauses".
 */
public record OnboardTenancyWithAgreementRequest(

    @NotBlank
    @Size(max = 20)
    String tenantPhone,

    @Size(max = 120)
    String tenantName,

    @NotNull
    UUID propertyId,

    @NotNull
    UUID roomId,

    Long rentAmountPaise,

    Long depositAmountPaise,

    @NotNull
    LocalDate startDate,

    /**
     * The owner confirming they collected and checked the tenant's ID proof and
     * photograph. Enforced on both onboarding paths — gating only one would let
     * owners route around it without meaning to.
     */
    /**
     * The owner's ID-check declaration: confirmed, which document, last four.
     *
     * <p>{@code @NotNull} because onboarding cannot complete without it — the
     * review screen refuses to move on, and the server has to agree rather than
     * merely trust that it did.
     */
    @NotNull(message = "Confirm you have checked the tenant's ID proof and photograph before onboarding")
    @Valid IdCheckDeclarationInput idCheck,

    /**
     * The exact declaration wording the app displayed.
     *
     * <p>Checked against the server's own copy and refused on a mismatch, so an
     * old or altered build cannot record somebody as having declared something
     * we did not write.
     */
    @NotBlank String idCheckStatementText,

    /** How the owner's device described itself. Optional throughout. */
    @Valid DeviceFingerprintInput device,

    /**
     * The tenant's own particulars, which the deed names them by.
     *
     * <p>Collected here because the account may not exist yet. For one that does,
     * the screen prefills from it and sends back what it was given; the service
     * writes only the fields the account had blank, so an owner filling a form
     * cannot rewrite a tenant's own profile.
     */
    @NotNull(message = "Enter the tenant's details before onboarding")
    @Valid TenantDetailsInput tenant,

    /**
     * Which clauses this stay's deed carries.
     *
     * <p>Null uses the property's stored template. A value replaces it wholesale
     * for this tenancy only — the property's own template is never written here,
     * so a clause dropped for one tenant cannot vanish from anyone else's deed.
     */
    AgreementTemplate template,

    /**
     * This tenancy's agreement term, overriding the property default.
     *
     * <p>Null means "use the property's default". Present with a null
     * {@code months} means indefinite — which is why this is a nested record
     * rather than a bare Integer: a bare null could not tell "not specified"
     * apart from "no fixed term", and those produce different agreements.
     */
    @Valid
    AgreementTermInput term
) {

    public record AgreementTermInput(
            @Min(value = 1, message = "A fixed term must be at least 1 month")
            @Max(value = 12, message = "A fixed term cannot exceed 12 months")
            Integer months,

            /**
             * What leaving before the term ends costs, in the owner's own words.
             *
             * <p>Free text and applied by a person, never computed — the penalty
             * engine this replaced produced a number nobody had agreed to.
             */
            @Size(max = 2000) String earlyExitRule) {
    }

    /**
     * The particulars the deed names the tenant by.
     *
     * <p>No email. A deed is fixed at signing and an account is not, so a tenant
     * who changes their address afterwards would leave the document asserting a
     * contact that no longer reaches them. The phone number they authenticate
     * with is on the deed instead, and it cannot drift the same way.
     */
    public record TenantDetailsInput(
            @NotBlank @Size(max = 300) String permanentAddress,
            @NotBlank @Pattern(regexp = "\\d{6}", message = "PIN code must be 6 digits") String permanentAddressPincode,
            @Past(message = "Date of birth must be in the past") LocalDate dateOfBirth,
            Gender gender) {
    }
}
