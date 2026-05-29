package com.khatiyan.d_modules.notice.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to add a notice board category.
 */
public record CreatePropertyBoardCategoryRequest(

    @NotBlank
    @Size(max = 80)
    String name,

    @NotBlank
    @Size(max = 80)
    String slug,

    @Min(0)
    Integer displayOrder
) {
}
