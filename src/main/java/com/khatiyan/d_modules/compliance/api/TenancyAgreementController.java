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

import jakarta.servlet.http.HttpServletRequest;
import com.khatiyan.d_modules.compliance.api.dto.LegalStatementResponse;
import com.khatiyan.d_modules.compliance.api.dto.MiscClauseOption;
import com.khatiyan.d_modules.compliance.model.LegalStatement;
import com.khatiyan.c_shared.http.ClientIpResolver;
import com.khatiyan.d_modules.compliance.api.dto.AcceptAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.AgreementDeedResponse;
import com.khatiyan.d_modules.compliance.api.dto.AgreementPreviewQuery;
import com.khatiyan.d_modules.compliance.api.dto.AgreementSigningChallengeResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.compliance.ComplianceModule;
import com.khatiyan.d_modules.compliance.api.dto.CancelPendingTenancyRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.compliance.api.dto.OnboardingReadinessResponse;
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
    private final ClientIpResolver clientIpResolver;

    public TenancyAgreementController(
            ComplianceModule complianceModule,
            ClientIpResolver clientIpResolver) {
        this.complianceModule = complianceModule;
        this.clientIpResolver = clientIpResolver;
    }

    // Owner/manager endpoints

    /**
     * A POST that reads nothing, because the query no longer fits in a URL.
     *
     * <p>The preview now depends on the room, the term and the owner's clause
     * selection for this stay — a whole template. Encoding an exclusion set and a
     * list of custom clauses into query parameters would be a URL nobody could
     * debug, and would hit length limits on a property with many custom clauses.
     */
    @PostMapping("/properties/{propertyId}/agreement-preview")
    public AgreementDeedResponse previewAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody AgreementPreviewQuery query) {
        return complianceModule.previewAgreement(user.userId(), query);
    }

    /**
     * Whether onboarding can start at this property.
     *
     * <p>Read by the screen so it can show a blocking board on arrival instead of
     * letting somebody fill in a tenant's details and then refusing the write.
     */
    @GetMapping("/properties/{propertyId}/onboarding-readiness")
    public OnboardingReadinessResponse onboardingReadiness(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return complianceModule.onboardingReadiness(user.userId(), propertyId);
    }

    /**
     * The opt-in clause library, with its full wording.
     *
     * <p>Open to any signed-in caller and not property-scoped: it is a fixed
     * catalogue, identical everywhere, and gating it would only mean the picker
     * needed a property before it could render a list that never varies.
     */
    @GetMapping("/misc-clauses")
    public List<MiscClauseOption> miscClauses() {
        return MiscClauseOption.all();
    }

    /**
     * The wording for one click-wrap, by key.
     *
     * <p>Open to any signed-in caller: an owner needs the ID declaration and a
     * tenant needs the acceptance text, and neither is privileged — they are the
     * words we are about to ask that person to agree to.
     */
    @GetMapping("/legal-statements/{key}")
    public LegalStatementResponse legalStatement(@PathVariable String key) {
        LegalStatement statement = LegalStatement.valueOf(key);
        return new LegalStatementResponse(statement.key(), statement.version(), statement.text());
    }

    @PostMapping("/tenancies/onboard-with-agreement")
    public OnboardTenancyWithAgreementResponse onboardWithAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody OnboardTenancyWithAgreementRequest request,
            HttpServletRequest servletRequest) {
        return complianceModule.onboardTenancyWithAgreement(
                user.userId(),
                request,
                clientIpResolver.resolve(servletRequest),
                user.sessionId());
    }

    @GetMapping("/tenancies/{tenancyId}/agreement")
    public TenancyAgreementResponse getTenancyAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return complianceModule.getTenancyAgreement(user.userId(), tenancyId);
    }

    @PutMapping("/tenancies/{tenancyId}/agreement/template")
    public TenancyAgreementResponse updateTemplate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody UpdateAgreementCustomClausesRequest request) {
        return complianceModule.updateTenancyAgreementTemplate(user.userId(), tenancyId, request);
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

    /**
     * Step one of signing: send the code, and say what is about to be signed.
     *
     * <p>Returns the click-wrap wording from the server rather than letting the
     * app supply it, so what somebody agreed to is not whatever their installed
     * build happened to contain.
     */
    @PostMapping("/me/agreement/signing-code")
    public AgreementSigningChallengeResponse startAgreementSigning(
            @AuthenticationPrincipal UserPrincipal user,
            HttpServletRequest servletRequest) {
        return complianceModule.startAgreementSigning(user.userId(), clientIpResolver.resolve(servletRequest));
    }

    /**
     * Step two: check the code against the text, then sign.
     *
     * <p>The address is resolved here rather than accepted from the body. An
     * address the signatory supplied would be the one thing in the record they
     * chose themselves, which is precisely what makes the rest of it worth
     * having.
     */
    @PostMapping("/me/agreement/accept")
    public TenancyAgreementResponse acceptMyAgreement(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody AcceptAgreementRequest request,
            HttpServletRequest servletRequest) {
        return complianceModule.acceptMyAgreement(
                user.userId(),
                request,
                clientIpResolver.resolve(servletRequest),
                user.sessionId());
    }

    @PostMapping("/me/agreement/decline")
    public void declineMyAgreement(@AuthenticationPrincipal UserPrincipal user) {
        complianceModule.declineMyAgreement(user.userId());
    }
}
