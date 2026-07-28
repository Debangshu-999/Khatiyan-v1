package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateIncomeRequest(
        @NotBlank @Size(max = 120) String source,
        @Size(max = 160) String receivedFrom,
        @Positive long amountPaise,
        @NotNull LocalDate receivedDate,
        @Size(max = 500) String description) {
}
