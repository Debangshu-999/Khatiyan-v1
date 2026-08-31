package com.khatiyan.a_auth;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.a_auth.service.AuthService;

/**
 * Public facade for the auth module.
 *
 * <p>Other modules should depend on this class instead of importing
 * auth services, repositories, or user entities directly. The facade
 * exposes stable user lookup and provisioning operations for the
 * modular monolith.
 */
@Component
public class AuthModule {

    private final AuthService authService;

    public AuthModule(AuthService authService) {
        this.authService = authService;
    }

    public Optional<UserSummaryResponse> findById(UUID userId) {
        return authService.findById(userId);
    }

    public Map<UUID, UserSummaryResponse> findByIds(Collection<UUID> userIds) {
        return authService.findByIds(userIds);
    }

    public Optional<UserSummaryResponse> findByPhone(String phone) {
        return authService.findByPhone(phone);
    }

    /**
     * The particulars a deed names a person by, for the compliance module.
     *
     * <p>Separate from {@link #findById} because it carries a permanent address
     * and a date of birth. The summary is returned wherever a person is mentioned
     * anywhere in the app; this is read only where an agreement is being built.
     */
    public Optional<UserIdentityResponse> findIdentity(UUID userId) {
        return authService.findIdentity(userId);
    }

    /**
     * Fills a tenant's blank profile fields from what an owner supplied at
     * onboarding, and never overwrites one they set themselves.
     *
     * <p>One-directional by design. An owner typing into an onboarding form is not
     * editing the tenant's profile — a form that prefilled from the account and
     * wrote everything back would let them silently replace an address its owner
     * had chosen.
     *
     * <p>No email. Onboarding stopped collecting one when the tenant's address
     * left the deed, so there is nothing here to write and nothing that could
     * land on an account unverified.
     */
    public void fillMissingTenantIdentity(
            UUID userId,
            String permanentAddress,
            String permanentAddressPincode,
            LocalDate dateOfBirth,
            Gender gender) {
        authService.fillMissingTenantIdentity(
                userId, permanentAddress, permanentAddressPincode, dateOfBirth, gender);
    }

    public UUID provisionManagerUser(String phone, String fullName, UUID provisionedBy) {
        return authService.provisionManagerUser(phone, fullName, provisionedBy);
    }

    public UUID provisionTenantUser(String phone, String fullName, UUID provisionedBy) {
        return authService.provisionTenantUser(phone, fullName, provisionedBy);
    }

    /**
     * Sends a tenancy-agreement signing code, returning the masked destination.
     *
     * <p>Exposed here rather than letting compliance reach OtpService directly.
     * The purpose is what keeps a login code from being spent as a signature,
     * and that guarantee is worth only as much as the number of places that can
     * choose a purpose.
     */
    public String startAgreementSigning(UUID userId, String requestIpAddress) {
        return authService.startAgreementSigning(userId, requestIpAddress);
    }

    /** Verifies and spends a signing code. Returns the masked destination it went to. */
    public String completeAgreementSigning(UUID userId, String otp) {
        return authService.completeAgreementSigning(userId, otp);
    }

    public void markActiveTenant(UUID userId) {
        authService.markActiveTenant(userId);
    }

    public void clearActiveTenant(UUID userId) {
        authService.clearActiveTenant(userId);
    }
}
