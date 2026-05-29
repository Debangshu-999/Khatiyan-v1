package com.khatiyan.d_modules.notice.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to update a notice board category.
 */
public record UpdatePropertyBoardCategoryRequest(

    @NotBlank
    @Size(max = 80)
    String name,

    @NotBlank
    @Size(max = 80)
    String slug,

    @NotNull
    @Min(0)
    Integer displayOrder
) {
}
