package com.khatiyan.d_modules.expense.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.expense.model.ExpenseCategory;

public record ExpenseCategoryResponse(
        UUID id,
        String name,
        boolean system,
        boolean active,
        /** The row's version (2026-09-29): sent back as If-Match when a screen acts on it. */
        long version
) {

    public static ExpenseCategoryResponse from(ExpenseCategory category) {
        return new ExpenseCategoryResponse(
                category.getId(),
                category.getName(),
                category.isSystem(),
                category.isActive(), category.getVersion());
    }
}
