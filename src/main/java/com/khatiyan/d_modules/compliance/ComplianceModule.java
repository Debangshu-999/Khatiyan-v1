package com.khatiyan.d_modules.compliance;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.PropertyAgreementSettingsResponse;
import com.khatiyan.d_modules.compliance.api.dto.TenancyAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.UpdateAgreementCustomClausesRequest;
import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.service.AgreementService;
import com.khatiyan.d_modules.compliance.service.TenancyAgreementService;

/**
 * Public facade for the compliance module. Other modules and this module's own
 * controllers depend on this class rather than reaching into compliance
 * services, repositories, or entities directly.
 */
@Component
public class ComplianceModule {

    private final AgreementService agreementService;
    private final TenancyAgreementService tenancyAgreementService;

    public ComplianceModule(
            AgreementService agreementService,
            TenancyAgreementService tenancyAgreementService) {
        this.agreementService = agreementService;
        this.tenancyAgreementService = tenancyAgreementService;
    }

    // ---- Property agreement settings ------------------------------------

    public PropertyAgreementSettingsResponse getPropertyAgreementSettings(UUID actorUserId, UUID propertyId) {
        return PropertyAgreementSettingsResponse.from(
                agreementService.getOrSeedPropertySettings(actorUserId, propertyId));
    }

    public PropertyAgreementSettingsResponse updatePropertyAgreementSettings(
            UUID actorUserId, UUID propertyId, List<AgreementClause> defaultClauses) {
        return PropertyAgreementSettingsResponse.from(
                agreementService.updatePropertySettings(actorUserId, propertyId, defaultClauses));
    }

    // ---- Per-tenancy agreements ------------------------------------------

    public List<AgreementClause> previewAgreement(
            UUID actorUserId, UUID propertyId, Long rentAmountPaise, Long depositAmountPaise) {
        return tenancyAgreementService.preview(actorUserId, propertyId, rentAmountPaise, depositAmountPaise);
    }

    public OnboardTenancyWithAgreementResponse onboardTenancyWithAgreement(
            UUID actorUserId, OnboardTenancyWithAgreementRequest request) {
        TenancyAgreementService.OnboardResult result = tenancyAgreementService.onboardWithAgreement(actorUserId, request);
        return new OnboardTenancyWithAgreementResponse(
                result.tenantAccountCreated(),
                result.tenancy(),
                TenancyAgreementResponse.from(result.agreement()));
    }

    public TenancyAgreementResponse getTenancyAgreement(UUID actorUserId, UUID tenancyId) {
        return TenancyAgreementResponse.from(
                tenancyAgreementService.getForManagedTenancy(actorUserId, tenancyId));
    }

    public TenancyAgreementResponse updateTenancyAgreementCustomClauses(
            UUID actorUserId, UUID tenancyId, UpdateAgreementCustomClausesRequest request) {
        return TenancyAgreementResponse.from(
                tenancyAgreementService.updateCustomClauses(actorUserId, tenancyId, request.customClauses()));
    }

    public TenancyAgreementResponse getMyAgreement(UUID tenantUserId) {
        return TenancyAgreementResponse.from(tenancyAgreementService.getMyAgreement(tenantUserId));
    }

    public TenancyAgreementResponse acceptMyAgreement(UUID tenantUserId) {
        return TenancyAgreementResponse.from(tenancyAgreementService.accept(tenantUserId));
    }

    public void declineMyAgreement(UUID tenantUserId) {
        tenancyAgreementService.decline(tenantUserId);
    }
}
