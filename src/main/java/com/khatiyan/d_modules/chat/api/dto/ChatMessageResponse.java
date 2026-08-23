package com.khatiyan.d_modules.chat.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.chat.model.ChatMessage;

/**
 * One message as the client renders it.
 *
 * <p>A deleted message keeps its place in the sequence and returns no body and
 * no attachments — the row still exists so the conversation does not silently
 * renumber itself for whoever already read it.
 */
public record ChatMessageResponse(
    UUID id,
    long seq,
    UUID authorUserId,
    String authorName,
    /** Null for most people — uploading one is not wired yet. Initials stand in. */
    String authorPhotoUrl,
    /** True when the reader wrote it, so the client need not compare ids. */
    boolean mine,
    String body,
    List<ChatAttachmentResponse> attachments,
    boolean deleted,
    /** Shown beside the time, so the reader knows the words changed after sending. */
    boolean edited,
    Instant sentAt
) {
    public static ChatMessageResponse from(
            ChatMessage message, String authorName, String authorPhotoUrl, UUID readerUserId) {
        boolean deleted = message.isDeleted();
        return new ChatMessageResponse(
                message.getId(),
                message.getSeq() == null ? 0L : message.getSeq(),
                message.getAuthorUserId(),
                authorName,
                authorPhotoUrl,
                message.getAuthorUserId().equals(readerUserId),
                deleted ? null : message.getBody(),
                deleted
                        ? List.of()
                        : message.getAttachments().stream().map(ChatAttachmentResponse::from).toList(),
                deleted,
                message.isEdited(),
                message.getCreatedAt());
    }
}
