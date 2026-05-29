package com.khatiyan.d_modules.notice.api.dto;

import java.time.Instant;

import com.khatiyan.d_modules.notice.model.NoticePriority;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to edit a still-published notice.
 */
public record UpdateNoticeRequest(

    @NotBlank
    @Size(max = 160)
    String title,

    @NotBlank
    @Size(max = 2000)
    String body,

    @NotNull
    NoticePriority priority,

    Instant visibleFrom,

    Instant visibleUntil
) {
}
