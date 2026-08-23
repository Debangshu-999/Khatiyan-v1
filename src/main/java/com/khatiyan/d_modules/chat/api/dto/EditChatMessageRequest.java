package com.khatiyan.d_modules.chat.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * New words for a message already sent.
 *
 * <p>Blank is refused rather than treated as a delete: emptying a message and
 * removing it are different intentions, and guessing between them from an empty
 * string would silently pick one.
 */
public record EditChatMessageRequest(
    @NotBlank @Size(max = 2000) String body
) {}
