package com.khatiyan.d_modules.notice.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/** A batch of already-uploaded files being attached to an existing notice. */
public record AddNoticeAttachmentsRequest(

    @NotEmpty
    @Size(max = 10)
    @Valid
    List<NoticeAttachmentRequest> attachments
) {
}
