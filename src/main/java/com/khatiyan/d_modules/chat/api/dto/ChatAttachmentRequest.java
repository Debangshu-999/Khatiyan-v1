package com.khatiyan.d_modules.chat.api.dto;

import com.khatiyan.d_modules.chat.model.ChatAttachmentKind;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * One already-uploaded asset being attached to a message.
 *
 * <p>The upload happened before this request: the client signed a request,
 * pushed the file straight to Cloudinary, and is now recording where it landed.
 */
public record ChatAttachmentRequest(
    @NotNull ChatAttachmentKind kind,
    @NotBlank @Size(max = 500) String url,
    @Size(max = 255) String publicId,
    /** The sender's original filename. The only thing that tells a reader what a document is. */
    @Size(max = 120) String fileName,
    @Size(max = 100) String contentType,
    Long sizeBytes
) {}
