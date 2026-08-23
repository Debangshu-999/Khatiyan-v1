package com.khatiyan.d_modules.chat.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * Text, attachments, or both.
 *
 * <p>Neither field is required on its own — a message with only a photo is
 * ordinary — but the service refuses one that carries nothing at all.
 */
public record SendChatMessageRequest(
    @Size(max = 2000) String body,
    @Valid @Size(max = 5) List<ChatAttachmentRequest> attachments
) {}
