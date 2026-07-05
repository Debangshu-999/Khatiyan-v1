package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.expense.model.RecurringExpense;

/**
 * A recurring expense template. {@code system} rows are derived by the platform
 * rather than stored — today that is the projected staff salary — and cannot be
 * edited or deactivated.
 */
public record RecurringExpenseResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String paidTo,
        long amountPaise,
        String description,
        int dayOfMonth,
        boolean active,
        LocalDate lastGeneratedMonth,
        boolean system) {

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
                recurring.getLastGeneratedMonth(),
                false);
    }
}
