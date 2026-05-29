package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.notice.model.PropertyBoardCategory;

/**
 * API representation of a configurable notice board category.
 */
public record PropertyBoardCategoryResponse(
    UUID id,
    UUID propertyId,
    UUID createdByUserId,
    String name,
    String slug,
    int displayOrder,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static PropertyBoardCategoryResponse from(PropertyBoardCategory category) {
        return new PropertyBoardCategoryResponse(
            category.getId(),
            category.getPropertyId(),
            category.getCreatedByUserId(),
            category.getName(),
            category.getSlug(),
            category.getDisplayOrder(),
            category.isCurrentlyActive(),
            category.getCreatedAt(),
            category.getUpdatedAt()
        );
    }
}
