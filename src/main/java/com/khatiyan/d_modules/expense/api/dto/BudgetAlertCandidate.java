package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/** A property whose month-to-date spend has crossed a budget alert threshold. */
public record BudgetAlertCandidate(
        UUID propertyId,
        BudgetAlertThreshold threshold,
        long spentPaise,
        long budgetPaise,
        LocalDate month) {
}
