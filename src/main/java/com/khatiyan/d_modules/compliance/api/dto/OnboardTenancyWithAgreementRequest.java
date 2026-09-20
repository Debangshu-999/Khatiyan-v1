package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;

import com.khatiyan.d_modules.servicebalance.model.ServiceCode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
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
    @Valid IdCheckDeclarationInput idCheck,

    /**
     * The exact declaration wording the app displayed.
     *
     * <p>Checked against the server's own copy and refused on a mismatch, so an
     * old or altered build cannot record somebody as having declared something
     * we did not write.
     */
    String idCheckStatementText,

    /**
     * Checks the tenant will run on themselves, instead of the owner declaring.
     *
     * <p>The other route. An owner either says "I looked at their passport" or
     * asks for a government check the TENANT performs on their own phone —
     * never both, and never neither. Ordering these costs the owner money and
     * is refused if their Service balance will not carry it, which is the only
     * point at which a paid check can be refused at all.
     */
    @Valid List<VerificationOrderInput> verification,

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

    /**
     * Exactly one route, never both and never neither.
     *
     * <p>Cross-field rather than per-field, because neither half is required on
     * its own and requiring both would make the manual route impossible. Left
     * to the fields alone, a request carrying neither would create a tenancy
     * with nothing established about who the tenant is — which is the one
     * outcome onboarding exists to prevent.
     */
    @AssertTrue(message = "Choose how this tenant's identity is established: check their ID yourself, or order a verification")
    public boolean isIdentityRouteChosen() {
        boolean declared = idCheck != null;
        boolean ordered = verification != null && !verification.isEmpty();
        return declared ^ ordered;
    }

    /**
     * The declaration wording is only needed by the route that uses it.
     *
     * <p>An owner ordering a check declares nothing — the tenant has not done
     * it yet — so demanding the sentence there would have meant sending a
     * statement nobody made.
     */
    @AssertTrue(message = "This version of the app is showing an outdated declaration")
    public boolean isDeclarationTextPresentWhenDeclaring() {
        return idCheck == null || (idCheckStatementText != null && !idCheckStatementText.isBlank());
    }

    /**
     * One check, and how many tries the tenant gets at it.
     *
     * <p>The attempts are the owner's decision and their cost. The bounds match
     * the picker the app shows, and are repeated here because a client is not a
     * place to enforce a limit that spends money.
     */
    public record VerificationOrderInput(
            @NotNull(message = "Choose which check to order")
            ServiceCode serviceCode,

            @NotNull(message = "Choose how many attempts to give")
            @Min(value = 1, message = "At least one attempt")
            @Max(value = 5, message = "At most five attempts")
            Integer attempts) {
    }

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
