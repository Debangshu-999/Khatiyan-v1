package com.khatiyan.d_modules.compliance.api.dto;

import com.khatiyan.d_modules.compliance.model.AgreementTemplate;

import jakarta.validation.constraints.NotNull;

/**
 * Amends one pending tenancy's deed by replacing its template.
 *
 * <p>Named for custom clauses when that was all it could change. It now carries
 * the whole template, because dropping a main clause and adding your own wording
 * in its place is one action, and a request that could only append prose could
 * not express it.
 */
public record UpdateAgreementCustomClausesRequest(
        @NotNull AgreementTemplate template) {
}
