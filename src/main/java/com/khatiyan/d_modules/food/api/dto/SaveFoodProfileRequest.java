package com.khatiyan.d_modules.food.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SaveFoodProfileRequest(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description,
        @Min(0) Integer displayOrder
) {
}
