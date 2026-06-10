package com.khatiyan.d_modules.tenancy.api.dto;

/**
 * Result of an admin phone lookup before onboarding a tenant.
 *
 * <p>{@code canOnboard} is true when the phone is free to start a tenancy —
 * either a brand-new number or an existing tenant-role user without an active
 * tenancy. {@code message} explains the outcome for the wizard.
 */
public record TenantLookupResponse(
    boolean exists,
    String fullName,
    boolean activeTenant,
    boolean canOnboard,
    String message
) {
}
