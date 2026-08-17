package com.khatiyan.d_modules.notice.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A file on a recurring notice template, copied onto every day it generates.
 *
 * <p>For content that is the same each time — the photo on a supply-outage
 * notice, a standing menu PDF. Content that differs per day belongs on the
 * generated notice instead, where it ages out with that day. An owner picks per
 * template which of the two they want; a template with no attachments simply
 * generates days with none.
 */
@Entity
@Table(name = "recurring_notice_attachments", schema = "notice")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecurringNoticeAttachment extends BaseEntity {

    /**
     * Matched to the per-notice cap so a generated day can never be born over
     * the limit before its owner has added anything.
     */
    public static final int MAX_PER_TEMPLATE = NoticeAttachment.MAX_PER_NOTICE;

    private static final int MAX_URL_LENGTH = 600;
    private static final int MAX_PUBLIC_ID_LENGTH = 255;
    private static final int MAX_FILE_NAME_LENGTH = 255;
    private static final int MAX_CONTENT_TYPE_LENGTH = 120;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "recurring_notice_id", nullable = false, updatable = false)
    private UUID recurringNoticeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NoticeAttachmentKind kind;

    @Column(nullable = false, length = MAX_URL_LENGTH)
    private String url;

    @Column(name = "public_id", length = MAX_PUBLIC_ID_LENGTH)
    private String publicId;

    @Column(name = "file_name", nullable = false, length = MAX_FILE_NAME_LENGTH)
    private String fileName;

    @Column(name = "content_type", length = MAX_CONTENT_TYPE_LENGTH)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    private RecurringNoticeAttachment(
            UUID recurringNoticeId,
            NoticeAttachmentKind kind,
            String url,
            String publicId,
            String fileName,
            String contentType,
            Long sizeBytes,
            int sortOrder) {
        this.id = UUID.randomUUID();
        this.recurringNoticeId = recurringNoticeId;
        this.kind = kind == null ? NoticeAttachmentKind.DOCUMENT : kind;
        this.url = required(url, MAX_URL_LENGTH, "Attachment URL");
        this.publicId = optional(publicId, MAX_PUBLIC_ID_LENGTH);
        this.fileName = required(fileName, MAX_FILE_NAME_LENGTH, "File name");
        this.contentType = optional(contentType, MAX_CONTENT_TYPE_LENGTH);
        this.sizeBytes = sizeBytes;
        this.sortOrder = sortOrder;
    }

    public static RecurringNoticeAttachment of(
            UUID recurringNoticeId,
            NoticeAttachmentKind kind,
            String url,
            String publicId,
            String fileName,
            String contentType,
            Long sizeBytes,
            int sortOrder) {
        return new RecurringNoticeAttachment(
                recurringNoticeId, kind, url, publicId, fileName, contentType, sizeBytes, sortOrder);
    }

    private String required(String value, int max, String label) {
        if (value == null || value.isBlank()) {
            throw new ValidationException(label + " is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new ValidationException(label + " is too long");
        }
        return trimmed;
    }

    private String optional(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }
}
