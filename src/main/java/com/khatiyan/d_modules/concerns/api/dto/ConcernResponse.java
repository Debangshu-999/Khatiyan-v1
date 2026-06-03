package com.khatiyan.d_modules.concerns.api.dto;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;
import com.khatiyan.d_modules.concerns.model.ConcernPriority;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;

/**
 * API representation of a tenant concern and its lifecycle state.
 */
public record ConcernResponse(
    UUID id,
    String referenceCode,
    UUID propertyId,
    UUID roomId,
    UUID tenancyId,
    UUID raisedByUserId,
    UUID assignedToUserId,
    UUID resolvedByUserId,
    ConcernCategory category,
    ConcernPriority priority,
    ConcernEscalationLevel escalationLevel,
    ConcernStatus status,
    String title,
    String description,
    String resolutionNote,
    Instant resolvedAt,
    Instant reopenUntil,
    boolean reopened,
    String reopenReason,
    Instant reopenedAt,
    Instant createdAt,
    Instant updatedAt,
    List<ConcernPhotoResponse> photos
) {
    public static ConcernResponse from(Concern concern) {
        List<ConcernPhotoResponse> photos = concern.getPhotos()
            .stream()
            .sorted(Comparator.comparingInt(photo -> photo.getDisplayOrder()))
            .map(photo -> ConcernPhotoResponse.from(photo))
            .toList();

        return new ConcernResponse(
            concern.getId(),
            concern.getReferenceCode(),
            concern.getPropertyId(),
            concern.getRoomId(),
            concern.getTenancyId(),
            concern.getRaisedByUserId(),
            concern.getAssignedToUserId(),
            concern.getResolvedByUserId(),
            concern.getCategory(),
            concern.getPriority(),
            concern.getEscalationLevel(),
            concern.getStatus(),
            concern.getTitle(),
            concern.getDescription(),
            concern.getResolutionNote(),
            concern.getResolvedAt(),
            concern.getReopenUntil(),
            concern.isReopened(),
            concern.getReopenReason(),
            concern.getReopenedAt(),
            concern.getCreatedAt(),
            concern.getUpdatedAt(),
            photos
        );
    }
}
