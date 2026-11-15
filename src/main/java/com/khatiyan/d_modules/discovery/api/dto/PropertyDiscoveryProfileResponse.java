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
        boolean showMealRating,
        /** The current meal rating, whether or not the listing shows it. Null with none. */
        Double mealRating,
        Instant publishedAt,
        boolean active
) {

    public static PropertyDiscoveryProfileResponse from(PropertyDiscoveryProfile profile, Double mealRating) {
        return new PropertyDiscoveryProfileResponse(
                profile.getId(),
                profile.getPropertyId(),
                profile.getHeadline(),
                profile.getDescription(),
                profile.getProfileImageUrl(),
                profile.isPublicVisible(),
                profile.isShowOwnerContact(),
                profile.isShowManagerContact(),
                profile.isShowMealRating(),
                mealRating,
                profile.getPublishedAt(),
                profile.isActive());
    }
}
