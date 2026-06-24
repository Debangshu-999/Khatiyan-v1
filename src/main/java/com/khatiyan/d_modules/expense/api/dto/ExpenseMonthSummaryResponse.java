package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.List;

public record ExpenseMonthSummaryResponse(
        LocalDate month,
        long totalSpentPaise,
        Long budgetPaise,
        List<ExpenseCategoryTotal> byCategory) {
}
