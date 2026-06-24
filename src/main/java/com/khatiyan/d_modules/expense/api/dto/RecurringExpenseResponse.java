package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.expense.model.RecurringExpense;

public record RecurringExpenseResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String paidTo,
        long amountPaise,
        String description,
        int dayOfMonth,
        boolean active,
        LocalDate lastGeneratedMonth) {

    public static RecurringExpenseResponse from(RecurringExpense recurring, String categoryName) {
        return new RecurringExpenseResponse(
                recurring.getId(),
                recurring.getCategoryId(),
                categoryName,
                recurring.getPaidTo(),
                recurring.getAmountPaise(),
                recurring.getDescription(),
                recurring.getDayOfMonth(),
                recurring.isActive(),
                recurring.getLastGeneratedMonth());
    }
}
