package com.khatiyan.d_modules.expense.api.dto;

import java.util.UUID;

public record ExpenseCategoryTotal(
        UUID categoryId,
        String categoryName,
        long amountPaise) {
}
