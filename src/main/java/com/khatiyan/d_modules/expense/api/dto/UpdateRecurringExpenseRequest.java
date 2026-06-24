package com.khatiyan.d_modules.expense.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateRecurringExpenseRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 160) String paidTo,
        @Positive long amountPaise,
        @Min(1) @Max(28) int dayOfMonth,
        @Size(max = 500) String description) {
}
