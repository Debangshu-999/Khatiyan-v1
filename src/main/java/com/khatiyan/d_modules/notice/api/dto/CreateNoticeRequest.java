package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;
import java.util.List;

import com.khatiyan.d_modules.notice.model.NoticePriority;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to publish a property notice.
 */
public record CreateNoticeRequest(

    @NotBlank
    @Size(max = 160)
    String title,

    @NotBlank
    @Size(max = 2000)
    String body,

    @NotNull
    NoticePriority priority,

    Instant visibleFrom,

    Instant visibleUntil,

    /**
     * Files already uploaded to storage. The bytes never pass through here —
     * only the handles — so publishing stays fast however many were attached.
     */
    @Size(max = 10)
    @Valid
    List<NoticeAttachmentRequest> attachments
) {
}
