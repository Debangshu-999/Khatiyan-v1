package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
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
    @AssertTrue(message = "Confirm you have checked the tenant's ID proof and photograph before onboarding")
    boolean idCheckConfirmed,

    @Valid
    List<CustomClauseInput> customClauses,

    /**
     * This tenancy's agreement term, overriding the property default.
     *
     * <p>Null means "use the property's default". Present with a null
     * {@code months} means indefinite — which is why this is a nested record
     * rather than a bare Integer: a bare null could not tell "not specified"
     * apart from "no fixed term", and those produce different agreements.
     */
    @Valid
    AgreementTermInput term,

    /**
     * The deduction categories permitted for this tenancy.
     *
     * <p>Null uses the property's default set. A value must be a SUBSET of it:
     * onboarding may narrow what the deposit can be used for, never widen it.
     * Widening here would let a tenancy quietly grant powers the property's own
     * agreement never claimed.
     */
    List<@Size(max = 40) String> permittedDeductions
) {

    public record AgreementTermInput(
            @Min(value = 1, message = "A fixed term must be at least 1 month")
            @Max(value = 12, message = "A fixed term cannot exceed 12 months")
            Integer months) {
    }
}
