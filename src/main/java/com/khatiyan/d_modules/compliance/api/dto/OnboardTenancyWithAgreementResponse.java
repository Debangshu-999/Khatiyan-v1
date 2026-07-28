package com.khatiyan.d_modules.compliance.api.dto;

import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/** Result of agreement-path onboarding: the pending tenancy + its agreement. */
public record OnboardTenancyWithAgreementResponse(
        boolean tenantAccountCreated,
        TenancyResponse tenancy,
        TenancyAgreementResponse agreement) {
}
