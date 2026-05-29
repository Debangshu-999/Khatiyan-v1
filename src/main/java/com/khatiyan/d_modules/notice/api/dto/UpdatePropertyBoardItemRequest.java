package com.khatiyan.d_modules.notice.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to update a property dashboard item.
 */
public record UpdatePropertyBoardItemRequest(

    @NotNull
    UUID categoryId,

    @NotBlank
    @Size(max = 120)
    String title,

    @NotBlank
    @Size(max = 1000)
    String body,

    @NotNull
    @Min(0)
    Integer displayOrder
) {
}
