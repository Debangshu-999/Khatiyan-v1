package com.khatiyan.d_modules.expense.api.dto;

import jakarta.validation.constraints.PositiveOrZero;

/**
 * @param amountPaise      the fixed amount
 * @param incomeMode       how much of each month's received income joins it
 *                         (2026-10-18): NONE, FULL or PART. Left as it stands when absent
 * @param incomePartPaise  for PART, the amount of income to add, never more
 *                         than the month receives
 */
public record SetDefaultBudgetRequest(
        @PositiveOrZero long amountPaise,
        com.khatiyan.d_modules.expense.model.BudgetIncomeMode incomeMode,
        @jakarta.validation.constraints.Positive(message = "The income amount must be more than zero") Long incomePartPaise) {

    /** The fixed amount alone, leaving the income share as it stands. */
    public SetDefaultBudgetRequest(long amountPaise) {
        this(amountPaise, null, null);
    }
}
