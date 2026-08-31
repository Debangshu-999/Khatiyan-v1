package com.khatiyan.d_modules.compliance;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.api.dto.AcceptAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.AgreementDeedResponse;
import com.khatiyan.d_modules.compliance.api.dto.AgreementPreviewQuery;
import com.khatiyan.d_modules.compliance.api.dto.AgreementSigningChallengeResponse;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.OnboardingReadinessResponse;
import com.khatiyan.d_modules.compliance.api.dto.PropertyAgreementSettingsResponse;
import com.khatiyan.d_modules.compliance.api.dto.TenancyAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.UpdateAgreementCustomClausesRequest;
import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;
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

    /**
     * Composed from both services rather than one.
     *
     * <p>{@code AgreementService} owns persistence and knows nothing of property
     * policy; rendering the deed needs the property, its billing rules and its
     * exit policies. Giving the settings service those dependencies would have
     * made it a second assembler.
     */
    public PropertyAgreementSettingsResponse getPropertyAgreementSettings(UUID actorUserId, UUID propertyId) {
        PropertyAgreementSettings settings = agreementService.getOrSeedPropertySettings(actorUserId, propertyId);
        return PropertyAgreementSettingsResponse.of(settings, tenancyAgreementService.previewTemplate(settings));
    }

    public PropertyAgreementSettingsResponse updatePropertyAgreementSettings(
            UUID actorUserId, UUID propertyId, AgreementTemplate template) {
        PropertyAgreementSettings settings =
                agreementService.updatePropertySettings(actorUserId, propertyId, template);
        return PropertyAgreementSettingsResponse.of(settings, tenancyAgreementService.previewTemplate(settings));
    }

    // ---- Per-tenancy agreements ------------------------------------------

    public AgreementDeedResponse previewAgreement(UUID actorUserId, AgreementPreviewQuery query) {
        return tenancyAgreementService.preview(actorUserId, query);
    }

    /** Whether a tenant can be onboarded here yet — read by the screen's gate. */
    public OnboardingReadinessResponse onboardingReadiness(UUID actorUserId, UUID propertyId) {
        return tenancyAgreementService.onboardingReadiness(actorUserId, propertyId);
    }

    public OnboardTenancyWithAgreementResponse onboardTenancyWithAgreement(
            UUID actorUserId, OnboardTenancyWithAgreementRequest request, String clientIp, UUID sessionJti) {
        TenancyAgreementService.OnboardResult result =
                tenancyAgreementService.onboardWithAgreement(actorUserId, request, clientIp, sessionJti);
        return new OnboardTenancyWithAgreementResponse(
                result.tenantAccountCreated(),
                result.tenancy(),
                TenancyAgreementResponse.from(result.agreement()));
    }

    public TenancyAgreementResponse getTenancyAgreement(UUID actorUserId, UUID tenancyId) {
        return TenancyAgreementResponse.from(
                tenancyAgreementService.getForManagedTenancy(actorUserId, tenancyId));
    }

    public TenancyAgreementResponse updateTenancyAgreementTemplate(
            UUID actorUserId, UUID tenancyId, UpdateAgreementCustomClausesRequest request) {
        return TenancyAgreementResponse.from(
                tenancyAgreementService.updateTemplate(actorUserId, tenancyId, request.template()));
    }

    public TenancyAgreementResponse getMyAgreement(UUID tenantUserId) {
        return TenancyAgreementResponse.from(tenancyAgreementService.getMyAgreement(tenantUserId));
    }

    /** Sends the signing code and returns what is being signed. */
    public AgreementSigningChallengeResponse startAgreementSigning(UUID tenantUserId, String clientIp) {
        return tenancyAgreementService.startSigning(tenantUserId, clientIp);
    }

    public TenancyAgreementResponse acceptMyAgreement(
            UUID tenantUserId, AcceptAgreementRequest request, String clientIp, UUID sessionJti) {
        return TenancyAgreementResponse.from(
                tenancyAgreementService.accept(tenantUserId, request, clientIp, sessionJti));
    }

    public void declineMyAgreement(UUID tenantUserId) {
        tenancyAgreementService.decline(tenantUserId);
    }

    /** Owner/manager withdraws a tenancy the tenant never accepted. */
    public void cancelPendingTenancy(UUID actorUserId, UUID tenancyId, String reason) {
        tenancyAgreementService.cancelPendingAsManager(actorUserId, tenancyId, reason);
    }
}
