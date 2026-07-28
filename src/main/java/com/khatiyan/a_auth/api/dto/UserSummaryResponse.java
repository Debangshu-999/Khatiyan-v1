package com.khatiyan.a_auth.api.dto;

import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;

import java.util.UUID;

/**
 * Public user summary exposed by the auth module.
 *
 * <p>This DTO is safe for controllers and module facades. It avoids
 * leaking credential fields such as PIN hash and credential version.
 */
public record UserSummaryResponse(
    UUID id,
    String phone,
    // Needed by the payment module for Razorpay's linked-account onboarding,
    // which requires a contactable email for the sub-merchant.
    String email,
    String fullName,
    String profilePhotoUrl,
    UserRole role,
    boolean activeTenant,
    boolean active,
    boolean phoneVerified,
    // Gate for payout setup: Razorpay sends account correspondence to this
    // address, so an unverified one is a support hole waiting to happen.
    boolean emailVerified,
    boolean profileCompleted
) {
    public static UserSummaryResponse from(User user) {
        return new UserSummaryResponse(
            user.getId(),
            user.getPhone(),
            user.getEmail(),
            user.getFullName(),
            user.getProfilePhotoUrl(),
            user.getRole(),
            user.isActiveTenant(),
            user.isActive(),
            user.isPhoneVerified(),
            user.isEmailVerified(),
            user.isProfileCompleted()
        );
    }
}
