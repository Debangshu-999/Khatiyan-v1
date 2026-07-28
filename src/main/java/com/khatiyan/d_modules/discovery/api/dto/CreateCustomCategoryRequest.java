package com.khatiyan.d_modules.discovery.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCustomCategoryRequest(
        @NotBlank @Size(max = 60) String name) {
}
