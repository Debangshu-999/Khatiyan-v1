package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;
import java.util.List;
import java.time.LocalDate;
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
    /** Set when this notice is one day's occurrence of a recurring template. */
    UUID recurringNoticeId,
    LocalDate occurrenceDate,
    Instant createdAt,
    Instant updatedAt,
    /** Files on this notice, in the order they were attached. */
    List<NoticeAttachmentResponse> attachments
) {
    /** For paths with no attachments to hand — lists that do not render them. */
    public static NoticeResponse from(Notice notice) {
        return from(notice, List.of());
    }

    public static NoticeResponse from(Notice notice, List<NoticeAttachmentResponse> attachments) {
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
            notice.getGeneratedFromRecurringNoticeId(),
            notice.getOccurrenceDate(),
            notice.getCreatedAt(),
            notice.getUpdatedAt(),
            attachments == null ? List.of() : attachments
        );
    }
}
