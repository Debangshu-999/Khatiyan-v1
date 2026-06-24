package com.khatiyan.d_modules.expense.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpsertExpenseCategoryRequest(
        @NotBlank @Size(max = 120) String name) {
}
