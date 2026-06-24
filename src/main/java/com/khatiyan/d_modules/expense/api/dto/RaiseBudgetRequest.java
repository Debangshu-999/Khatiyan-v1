package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record RaiseBudgetRequest(
        @NotNull LocalDate month,
        @Positive long amountPaise,
        @Size(max = 300) String reason) {
}
