package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.property.model.PropertyManager;

/**
 * API representation of an active manager assignment for a property.
 */
public record PropertyManagerResponse(
    UUID id,
    UUID propertyId,
    UUID managerUserId,
    String managerPhone,
    String managerFullName,
    String managerProfilePhotoUrl,
    UUID assignedByUserId,
    boolean active,
    boolean phoneVerified,
    boolean profileCompleted,
    boolean accountActive,
    Instant createdAt,
    /** The row's version (2026-09-29): sent back as If-Match when a screen acts on it. */
    long version
) {
    public static PropertyManagerResponse from(PropertyManager manager, UserSummaryResponse managerUser) {
        return new PropertyManagerResponse(
            manager.getId(),
            manager.getPropertyId(),
            manager.getManagerUserId(),
            managerUser.phone(),
            managerUser.fullName(),
            managerUser.profilePhotoUrl(),
            manager.getAssignedByUserId(),
            manager.isCurrentlyActive(),
            managerUser.phoneVerified(),
            managerUser.profileCompleted(),
            managerUser.active(),
            manager.getCreatedAt(), manager.getVersion());
    }
}
