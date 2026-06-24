package com.khatiyan.d_modules.expense.api.dto;

import jakarta.validation.constraints.PositiveOrZero;

public record SetDefaultBudgetRequest(
        @PositiveOrZero long amountPaise) {
}
