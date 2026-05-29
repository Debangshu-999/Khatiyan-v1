package com.khatiyan.a_auth;

import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
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

    public Optional<UserSummaryResponse> findByPhone(String phone) {
        return authService.findByPhone(phone);
    }

    public UUID provisionManagerUser(String phone, String fullName, UUID provisionedBy) {
        return authService.provisionManagerUser(phone, fullName, provisionedBy);
    }

    public UUID provisionTenantUser(String phone, String fullName, UUID provisionedBy) {
        return authService.provisionTenantUser(phone, fullName, provisionedBy);
    }

    public void markActiveTenant(UUID userId) {
        authService.markActiveTenant(userId);
    }

    public void clearActiveTenant(UUID userId) {
        authService.clearActiveTenant(userId);
    }
}
