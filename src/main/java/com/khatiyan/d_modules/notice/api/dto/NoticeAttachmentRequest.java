package com.khatiyan.d_modules.notice.api.dto;

import com.khatiyan.d_modules.notice.model.NoticeAttachmentKind;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * A file already in storage, being attached to a notice.
 *
 * <p>The bytes went straight from the device to Cloudinary; only the handle
 * travels through here, so this request stays small however large the file was.
 */
public record NoticeAttachmentRequest(

    @NotNull
    NoticeAttachmentKind kind,

    @NotBlank
    @Size(max = 600)
    String url,

    @Size(max = 255)
    String publicId,

    @NotBlank
    @Size(max = 255)
    String fileName,

    @Size(max = 120)
    String contentType,

    @PositiveOrZero
    Long sizeBytes
) {
}
