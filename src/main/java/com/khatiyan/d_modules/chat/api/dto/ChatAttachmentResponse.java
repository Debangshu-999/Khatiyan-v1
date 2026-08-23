package com.khatiyan.d_modules.chat.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.chat.model.ChatAttachmentKind;
import com.khatiyan.d_modules.chat.model.ChatMessageAttachment;

public record ChatAttachmentResponse(
    UUID id,
    ChatAttachmentKind kind,
    String url,
    String fileName,
    String contentType,
    Long sizeBytes
) {
    public static ChatAttachmentResponse from(ChatMessageAttachment attachment) {
        return new ChatAttachmentResponse(
                attachment.getId(),
                attachment.getKind(),
                attachment.getUrl(),
                attachment.getFileName(),
                attachment.getContentType(),
                attachment.getSizeBytes());
    }
}
