package com.khatiyan.d_modules.chat.model;

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
 * A picture or document sent with a message.
 *
 * <p>The upload has already happened by the time this exists: the client signs a
 * request, sends the file straight to Cloudinary, and posts the resulting url
 * here. The format allowlist is a signed upload parameter, so nothing the client
 * does after signing can widen what it was allowed to send.
 */
@Entity
@Table(name = "chat_message_attachments", schema = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessageAttachment extends BaseEntity {

    public static final int MAX_URL_LENGTH = 500;
    public static final int MAX_FILE_NAME_LENGTH = 120;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ChatAttachmentKind kind;

    @Column(nullable = false, length = MAX_URL_LENGTH)
    private String url;

    /**
     * Cloudinary's handle on the asset, kept so it can be reclaimed.
     *
     * <p>Nothing reclaims it yet — no orphan sweep exists anywhere in this
     * codebase, despite two comments elsewhere promising one.
     */
    @Column(name = "public_id", length = 255)
    private String publicId;

    /**
     * The name the sender's file had.
     *
     * <p>A public id is not a filename. For a document this is the only thing
     * that tells the reader what they are being sent.
     */
    @Column(name = "file_name", length = MAX_FILE_NAME_LENGTH)
    private String fileName;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    private ChatMessageAttachment(
            ChatAttachmentKind kind,
            String url,
            String publicId,
            String fileName,
            String contentType,
            Long sizeBytes) {
        this.id = UUID.randomUUID();
        this.kind = kind;
        this.url = url;
        this.publicId = publicId;
        this.fileName = fileName;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
    }

    public static ChatMessageAttachment of(
            ChatAttachmentKind kind,
            String url,
            String publicId,
            String fileName,
            String contentType,
            Long sizeBytes) {
        if (kind == null) {
            throw new ValidationException("An attachment needs a kind");
        }
        if (url == null || url.isBlank()) {
            throw new ValidationException("An attachment needs a url");
        }
        if (url.length() > MAX_URL_LENGTH) {
            throw new ValidationException("Attachment url is too long");
        }

        return new ChatMessageAttachment(
                kind,
                url.trim(),
                blankToNull(publicId),
                trimTo(fileName, MAX_FILE_NAME_LENGTH),
                blankToNull(contentType),
                sizeBytes);
    }

    /** Set by the message as it takes ownership, so order is a property of the list. */
    void placeAt(int position) {
        this.sortOrder = position;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String trimTo(String value, int max) {
        String cleaned = blankToNull(value);
        if (cleaned == null) {
            return null;
        }
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max);
    }
}
