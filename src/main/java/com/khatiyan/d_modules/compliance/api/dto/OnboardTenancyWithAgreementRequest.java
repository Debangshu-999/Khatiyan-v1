package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
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
    List<CustomClauseInput> customClauses
) {
}
