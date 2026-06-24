package com.khatiyan.d_modules.expense.api.dto;

import java.time.Instant;
import java.util.UUID;

public record BudgetRaiseItem(
        UUID id,
        long amountPaise,
        String reason,
        Instant createdAt) {
}
