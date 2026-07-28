package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementMode;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;

public record PropertyAgreementSettingsResponse(
        UUID propertyId,
        AgreementMode mode,
        List<AgreementClause> defaultClauses) {

    public static PropertyAgreementSettingsResponse from(PropertyAgreementSettings settings) {
        return new PropertyAgreementSettingsResponse(
                settings.getPropertyId(), settings.getMode(), settings.getDefaultClauses());
    }
}
