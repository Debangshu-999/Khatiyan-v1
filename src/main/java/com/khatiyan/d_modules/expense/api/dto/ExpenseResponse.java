package com.khatiyan.d_modules.expense.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.expense.model.Expense;
import com.khatiyan.d_modules.expense.model.ExpenseEntryType;

public record ExpenseResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String paidTo,
        long amountPaise,
        LocalDate incurredDate,
        ExpenseEntryType entryType,
        String description,
        UUID reversesExpenseId,
        boolean reversed,
        Instant createdAt) {

    public static ExpenseResponse from(Expense expense, String categoryName, boolean reversed) {
        return new ExpenseResponse(
                expense.getId(),
                expense.getCategoryId(),
                categoryName,
                expense.getPaidTo(),
                expense.getAmountPaise(),
                expense.getIncurredDate(),
                expense.getEntryType(),
                expense.getDescription(),
                expense.getReversesExpenseId(),
                reversed,
                expense.getCreatedAt());
    }
}
