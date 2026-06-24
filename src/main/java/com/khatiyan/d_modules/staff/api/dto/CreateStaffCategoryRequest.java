package com.khatiyan.d_modules.staff.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateStaffCategoryRequest(
        @NotBlank @Size(max = 120) String name) {
}
