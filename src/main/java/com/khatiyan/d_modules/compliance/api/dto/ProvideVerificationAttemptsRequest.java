package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

/**
 * More verification tries for a pending stay's tenant, per check. The same
 * per-check limits as ordering at onboarding: 1 to 5 attempts.
 */
public record ProvideVerificationAttemptsRequest(
        @NotEmpty(message = "Choose a check and how many attempts to add")
        @Valid
        List<OnboardTenancyWithAgreementRequest.VerificationOrderInput> verification) {
}
