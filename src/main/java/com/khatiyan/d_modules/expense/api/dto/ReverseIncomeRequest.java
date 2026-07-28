package com.khatiyan.d_modules.expense.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReverseIncomeRequest(
        @NotBlank @Size(max = 500) String reason) {
}
