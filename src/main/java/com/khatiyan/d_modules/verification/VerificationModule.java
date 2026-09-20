package com.khatiyan.d_modules.verification;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.servicebalance.model.ServiceCode;
import com.khatiyan.d_modules.verification.model.VerificationAttempt;
import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.service.VerificationResult;
import com.khatiyan.d_modules.verification.service.VerificationService;

/**
 * The module's front door.
 *
 * <p>Compliance calls {@link #order} while it is creating a tenancy, and asks
 * {@link #isSatisfied} before letting a tenant sign. Nothing else reaches past
 * this into the grants, so the rules about who may perform a check and who pays
 * for it stay in one place.
 */
@Component
public class VerificationModule {

    private final VerificationService verificationService;

    public VerificationModule(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    /**
     * Records what an owner wants checked, as part of creating a tenancy.
     *
     * <p>Throws when the owner's Service balance will not carry it — the only
     * point at which a paid check can be refused. Called inside the tenancy's
     * own transaction, so a refusal takes the tenancy with it rather than
     * leaving one that quietly has no checks on it.
     */
    public List<VerificationGrant> order(
            UUID tenancyId,
            UUID ownerUserId,
            UUID propertyId,
            UUID tenantUserId,
            Map<ServiceCode, Integer> attemptsByService,
            UUID actorUserId) {
        return verificationService.order(
                tenancyId, ownerUserId, propertyId, tenantUserId, attemptsByService, actorUserId);
    }

    /** What was asked of this tenancy, for the owner's review and the tenant's list. */
    public List<VerificationGrant> grantsForTenancy(UUID tenancyId) {
        return verificationService.grantsForTenancy(tenancyId);
    }

    /**
     * Whether signing may proceed.
     *
     * <p>True when nothing was ordered: an owner who asked for no checks has
     * not thereby blocked their tenant from signing.
     */
    public boolean isSatisfied(UUID tenancyId) {
        return verificationService.isSatisfied(tenancyId);
    }

    /** The tenant asks for a code. */
    public VerificationAttempt startOtp(UUID grantId, UUID tenantUserId, String aadhaarNumber) {
        return verificationService.startOtp(grantId, tenantUserId, aadhaarNumber);
    }

    /** The tenant submits it. */
    public VerificationResult submitOtp(UUID attemptId, UUID tenantUserId, String otp) {
        return verificationService.submitOtp(attemptId, tenantUserId, otp);
    }

    /**
     * The tenancy was cancelled, so nothing further runs or is charged.
     *
     * <p>Costs nothing to call: unused attempts were never charged, because the
     * provider never ran them.
     */
    public void cancelForTenancy(UUID tenancyId) {
        verificationService.cancelForTenancy(tenancyId);
    }
}
