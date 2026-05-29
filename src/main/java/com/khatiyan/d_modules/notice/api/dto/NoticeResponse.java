package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.model.NoticePriority;
import com.khatiyan.d_modules.notice.model.NoticeStatus;

/**
 * API representation of a property notice.
 */
public record NoticeResponse(
    UUID id,
    UUID propertyId,
    UUID createdByUserId,
    String title,
    String body,
    NoticePriority priority,
    NoticeStatus status,
    Instant visibleFrom,
    Instant visibleUntil,
    Instant publishedAt,
    Instant archivedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static NoticeResponse from(Notice notice) {
        return new NoticeResponse(
            notice.getId(),
            notice.getPropertyId(),
            notice.getCreatedByUserId(),
            notice.getTitle(),
            notice.getBody(),
            notice.getPriority(),
            notice.getStatus(),
            notice.getVisibleFrom(),
            notice.getVisibleUntil(),
            notice.getPublishedAt(),
            notice.getArchivedAt(),
            notice.getCreatedAt(),
            notice.getUpdatedAt()
        );
    }
}
