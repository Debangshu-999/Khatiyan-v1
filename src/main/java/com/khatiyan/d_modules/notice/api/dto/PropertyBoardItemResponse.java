package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.notice.model.PropertyBoardItem;

/**
 * API representation of a property dashboard item.
 */
public record PropertyBoardItemResponse(
    UUID id,
    UUID propertyId,
    UUID createdByUserId,
    UUID categoryId,
    String categoryName,
    String categorySlug,
    String title,
    String body,
    int displayOrder,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static PropertyBoardItemResponse from(PropertyBoardItem item) {
        return new PropertyBoardItemResponse(
            item.getId(),
            item.getPropertyId(),
            item.getCreatedByUserId(),
            item.getCategory().getId(),
            item.getCategory().getName(),
            item.getCategory().getSlug(),
            item.getTitle(),
            item.getBody(),
            item.getDisplayOrder(),
            item.isCurrentlyActive(),
            item.getCreatedAt(),
            item.getUpdatedAt()
        );
    }
}
