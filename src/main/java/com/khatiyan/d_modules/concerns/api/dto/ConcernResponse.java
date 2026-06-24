package com.khatiyan.d_modules.concerns.api.dto;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;

/**
 * API representation of a tenant concern and its lifecycle state.
 */
public record ConcernResponse(
    UUID id,
    String referenceCode,
    UUID propertyId,
    String roomNumber,
    String tenancyReferenceCode,
    UUID raisedByUserId,
    UUID assignedToUserId,
    String assignedToName,
    UUID assignedByUserId,
    String assignedByName,
    Instant assignedAt,
    UUID inProgressByUserId,
    Instant inProgressAt,
    UUID resolvedByUserId,
    ConcernCategory category,
    ConcernEscalationLevel escalationLevel,
    ConcernStatus status,
    String title,
    String description,
    String statusNote,
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
    public static ConcernResponse from(
            Concern concern,
            String roomNumber,
            String tenancyReferenceCode,
            String assignedToName,
            String assignedByName) {
        List<ConcernPhotoResponse> photos = concern.getPhotos()
            .stream()
            .sorted(Comparator.comparingInt(photo -> photo.getDisplayOrder()))
            .map(photo -> ConcernPhotoResponse.from(photo))
            .toList();

        return new ConcernResponse(
            concern.getId(),
            concern.getReferenceCode(),
            concern.getPropertyId(),
            roomNumber,
            tenancyReferenceCode,
            concern.getRaisedByUserId(),
            concern.getAssignedToUserId(),
            assignedToName,
            concern.getAssignedByUserId(),
            assignedByName,
            concern.getAssignedAt(),
            concern.getInProgressByUserId(),
            concern.getInProgressAt(),
            concern.getResolvedByUserId(),
            concern.getCategory(),
            concern.getEscalationLevel(),
            concern.getStatus(),
            concern.getTitle(),
            concern.getDescription(),
            concern.getStatusNote(),
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
