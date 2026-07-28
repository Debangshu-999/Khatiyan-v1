package com.khatiyan.d_modules.compliance.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.compliance.ComplianceModule;
import com.khatiyan.d_modules.compliance.api.dto.PropertyAgreementSettingsResponse;
import com.khatiyan.d_modules.compliance.api.dto.UpdatePropertyAgreementSettingsRequest;

import jakarta.validation.Valid;

/**
 * Owner/manager API for a property's agreement settings — the mode and the
 * default clause set every new tenancy agreement is seeded from.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/compliance/properties/{propertyId}/agreement-settings")
public class AgreementController {

    private final ComplianceModule complianceModule;

    public AgreementController(ComplianceModule complianceModule) {
        this.complianceModule = complianceModule;
    }

    @GetMapping
    public PropertyAgreementSettingsResponse get(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return complianceModule.getPropertyAgreementSettings(user.userId(), propertyId);
    }

    @PutMapping
    public PropertyAgreementSettingsResponse update(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyAgreementSettingsRequest request) {
        return complianceModule.updatePropertyAgreementSettings(
                user.userId(), propertyId, request.mode(), request.defaultClauses());
    }
}
