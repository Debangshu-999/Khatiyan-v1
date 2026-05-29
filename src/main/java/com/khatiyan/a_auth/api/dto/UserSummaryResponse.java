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
    String fullName,
    String profilePhotoUrl,
    UserRole role,
    boolean activeTenant,
    boolean active,
    boolean phoneVerified,
    boolean profileCompleted
) {
    public static UserSummaryResponse from(User user) {
        return new UserSummaryResponse(
            user.getId(),
            user.getPhone(),
            user.getFullName(),
            user.getProfilePhotoUrl(),
            user.getRole(),
            user.isActiveTenant(),
            user.isActive(),
            user.isPhoneVerified(),
            user.isProfileCompleted()
        );
    }
}
