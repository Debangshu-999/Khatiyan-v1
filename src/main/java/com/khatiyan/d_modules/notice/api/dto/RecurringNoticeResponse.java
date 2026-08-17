package com.khatiyan.d_modules.notice.api.dto;

import java.time.DayOfWeek;
import java.time.Instant;
import java.util.List;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.notice.model.NoticePriority;
import com.khatiyan.d_modules.notice.model.RecurringNotice;
import com.khatiyan.d_modules.notice.model.RecurringNoticeFrequency;
import com.khatiyan.d_modules.notice.model.RecurringNoticeStatus;

public record RecurringNoticeResponse(
    UUID id,
    UUID propertyId,
    UUID createdByUserId,
    String title,
    String body,
    NoticePriority priority,
    RecurringNoticeFrequency frequency,
    LocalTime startTime,
    LocalTime endTime,
    LocalDate activeFrom,
    LocalDate activeUntil,
    LocalDate lastGeneratedForDate,
    LocalDate lastProcessedForDate,
    RecurringNoticeStatus status,
    Instant createdAt,
    Instant updatedAt,
    /** Files copied onto every day this template generates. */
    List<NoticeAttachmentResponse> attachments
) {
    /** For paths with no attachments to hand — lists that do not render them. */
    public static RecurringNoticeResponse from(RecurringNotice recurringNotice) {
        return from(recurringNotice, List.of());
    }

    public static RecurringNoticeResponse from(
            RecurringNotice recurringNotice, List<NoticeAttachmentResponse> attachments) {
        return new RecurringNoticeResponse(
            recurringNotice.getId(),
            recurringNotice.getPropertyId(),
            recurringNotice.getCreatedByUserId(),
            recurringNotice.getTitle(),
            recurringNotice.getBody(),
            recurringNotice.getPriority(),
            recurringNotice.getFrequency(),
            recurringNotice.getStartTime(),
            recurringNotice.getEndTime(),
            recurringNotice.getActiveFrom(),
            recurringNotice.getActiveUntil(),
            recurringNotice.getLastGeneratedForDate(),
            recurringNotice.getLastProcessedForDate(),
            recurringNotice.getStatus(),
            recurringNotice.getCreatedAt(),
            recurringNotice.getUpdatedAt(),
            attachments == null ? List.of() : attachments
        );
    }
}
