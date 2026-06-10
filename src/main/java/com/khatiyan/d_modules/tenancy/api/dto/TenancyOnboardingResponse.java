package com.khatiyan.d_modules.tenancy.api.dto;

/**
 * Result of admin tenant onboarding.
 *
 * <p>{@code tenantAccountCreated} is true when a new tenant account was
 * provisioned as part of this call (vs. attaching the tenancy to an existing
 * account), so the wizard can show the right success message.
 */
public record TenancyOnboardingResponse(
    boolean tenantAccountCreated,
    TenancyResponse tenancy
) {
}
