package com.khatiyan.d_modules.compliance.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.compliance.ComplianceModule;
import com.khatiyan.d_modules.compliance.api.dto.CancelPendingTenancyRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.TenancyAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.UpdateAgreementCustomClausesRequest;
import com.khatiyan.d_modules.compliance.model.AgreementClause;

import jakarta.validation.Valid;

/**
 * Per-tenancy agreement API: owner preview/onboard/edit, tenant view + clickwrap
 * accept/decline. Acceptance activates the pending tenancy in one transaction.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/compliance")
public class TenancyAgreementController {

    private final ComplianceModule complianceModule;

    public TenancyAgreementController(ComplianceModule complianceModule) {
        this.complianceModule = complianceModule;
    }

    // Owner/manager endpoints

    @GetMapping("/properties/{propertyId}/agreement-preview")
    public List<AgreementClause> previewAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) Long rentAmountPaise,
            @RequestParam(required = false) Long depositAmountPaise) {
        return complianceModule.previewAgreement(user.userId(), propertyId, rentAmountPaise, depositAmountPaise);
    }

    @PostMapping("/tenancies/onboard-with-agreement")
    public OnboardTenancyWithAgreementResponse onboardWithAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody OnboardTenancyWithAgreementRequest request) {
        return complianceModule.onboardTenancyWithAgreement(user.userId(), request);
    }

    @GetMapping("/tenancies/{tenancyId}/agreement")
    public TenancyAgreementResponse getTenancyAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return complianceModule.getTenancyAgreement(user.userId(), tenancyId);
    }

    @PutMapping("/tenancies/{tenancyId}/agreement/custom-clauses")
    public TenancyAgreementResponse updateCustomClauses(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody UpdateAgreementCustomClausesRequest request) {
        return complianceModule.updateTenancyAgreementCustomClauses(user.userId(), tenancyId, request);
    }

    // Tenant endpoints

    /**
     * Withdraws a tenancy the tenant never accepted — they backed out, or it was
     * created by mistake. Refused once the agreement is accepted; a live stay
     * ends through the end-tenancy settlement instead.
     */
    @PostMapping("/tenancies/{tenancyId}/agreement/cancel")
    public void cancelPendingTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @RequestBody(required = false) CancelPendingTenancyRequest request) {
        complianceModule.cancelPendingTenancy(
                user.userId(),
                tenancyId,
                request == null || request.reason() == null || request.reason().isBlank()
                        ? "Withdrawn by the owner"
                        : request.reason().trim());
    }

    @GetMapping("/me/agreement")
    public TenancyAgreementResponse getMyAgreement(@AuthenticationPrincipal UserPrincipal user) {
        return complianceModule.getMyAgreement(user.userId());
    }

    @PostMapping("/me/agreement/accept")
    public TenancyAgreementResponse acceptMyAgreement(@AuthenticationPrincipal UserPrincipal user) {
        return complianceModule.acceptMyAgreement(user.userId());
    }

    @PostMapping("/me/agreement/decline")
    public void declineMyAgreement(@AuthenticationPrincipal UserPrincipal user) {
        complianceModule.declineMyAgreement(user.userId());
    }
}
