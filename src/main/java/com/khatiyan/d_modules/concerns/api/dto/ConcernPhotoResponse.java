package com.khatiyan.d_modules.concerns.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.concerns.model.ConcernPhoto;

/**
 * API representation of an image attached to a concern.
 */
public record ConcernPhotoResponse(
    UUID id,
    String photoUrl,
    String photoPublicId,
    int displayOrder,
    Instant createdAt
) {
    public static ConcernPhotoResponse from(ConcernPhoto photo) {
        return new ConcernPhotoResponse(
            photo.getId(),
            photo.getPhotoUrl(),
            photo.getPhotoPublicId(),
            photo.getDisplayOrder(),
            photo.getCreatedAt()
        );
    }
}
