package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateExpenseRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 160) String paidTo,
        @Positive long amountPaise,
        @NotNull LocalDate incurredDate,
        @Size(max = 500) String description) {
}
