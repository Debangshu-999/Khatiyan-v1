package com.khatiyan.d_modules.discovery.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;

public record PropertyDiscoveryProfileResponse(
        UUID id,
        UUID propertyId,
        String headline,
        String description,
        String profileImageUrl,
        boolean publicVisible,
        boolean showOwnerContact,
        boolean showManagerContact,
        Instant publishedAt,
        boolean active
) {

    public static PropertyDiscoveryProfileResponse from(PropertyDiscoveryProfile profile) {
        return new PropertyDiscoveryProfileResponse(
                profile.getId(),
                profile.getPropertyId(),
                profile.getHeadline(),
                profile.getDescription(),
                profile.getProfileImageUrl(),
                profile.isPublicVisible(),
                profile.isShowOwnerContact(),
                profile.isShowManagerContact(),
                profile.getPublishedAt(),
                profile.isActive());
    }
}
