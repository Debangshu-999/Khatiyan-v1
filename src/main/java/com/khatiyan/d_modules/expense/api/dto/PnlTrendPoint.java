package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;

public record PnlTrendPoint(
        LocalDate month,
        long incomePaise,
        long expensePaise,
        long netPaise) {
}
