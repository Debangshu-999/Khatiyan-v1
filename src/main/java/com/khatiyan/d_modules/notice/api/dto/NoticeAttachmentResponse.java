package com.khatiyan.d_modules.notice.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.notice.model.NoticeAttachment;
import com.khatiyan.d_modules.notice.model.NoticeAttachmentKind;

public record NoticeAttachmentResponse(
    UUID id,
    NoticeAttachmentKind kind,
    String url,
    String publicId,
    String fileName,
    String contentType,
    Long sizeBytes,
    int sortOrder
) {
    public static NoticeAttachmentResponse from(NoticeAttachment attachment) {
        return new NoticeAttachmentResponse(
            attachment.getId(),
            attachment.getKind(),
            attachment.getUrl(),
            attachment.getPublicId(),
            attachment.getFileName(),
            attachment.getContentType(),
            attachment.getSizeBytes(),
            attachment.getSortOrder()
        );
    }
}
