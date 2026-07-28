package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementMode;

import jakarta.validation.constraints.NotNull;

public record UpdatePropertyAgreementSettingsRequest(
        @NotNull AgreementMode mode,
        @NotNull List<AgreementClause> defaultClauses) {
}
