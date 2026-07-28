package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * Replaces the custom prose clauses of a still-pending tenancy agreement.
 * System clauses are untouched — they are derived and not editable.
 */
public record UpdateAgreementCustomClausesRequest(

    @NotNull
    @Valid
    List<CustomClauseInput> customClauses
) {
}
