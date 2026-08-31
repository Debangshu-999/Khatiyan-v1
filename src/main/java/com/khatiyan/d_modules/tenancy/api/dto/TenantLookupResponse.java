package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import com.khatiyan.a_auth.model.Gender;

/**
 * Result of an admin phone lookup before onboarding a tenant.
 *
 * <p>{@code canOnboard} is true when the phone is free to start a tenancy —
 * either a brand-new number or an existing tenant-role user without an active
 * tenancy. {@code message} explains the outcome for the wizard.
 *
 * <p>Carries the account's identity details so the onboarding form can prefill
 * them. A field that already holds a value is rendered READ-ONLY by the form and
 * is never written back: an owner filling in an onboarding form is not editing
 * somebody else's profile, and letting them overwrite an address its owner had
 * chosen would be a quiet way to do exactly that.
 *
 * @param prefill null for a phone with no account — everything is entered fresh
 */
public record TenantLookupResponse(
    boolean exists,
    String fullName,
    boolean activeTenant,
    boolean canOnboard,
    String message,
    TenantPrefill prefill
) {

    /** What the account already holds. A non-null field is not editable. */
    public record TenantPrefill(
            String permanentAddress,
            String permanentAddressPincode,
            LocalDate dateOfBirth,
            Gender gender) {
    }

    /** A phone with no account behind it. */
    public static TenantLookupResponse newUser(String message) {
        return new TenantLookupResponse(false, null, false, true, message, null);
    }

    /** An account that exists, whether or not it can be onboarded. */
    public static TenantLookupResponse existing(
            String fullName, boolean activeTenant, boolean canOnboard, String message, TenantPrefill prefill) {
        return new TenantLookupResponse(true, fullName, activeTenant, canOnboard, message, prefill);
    }
}
