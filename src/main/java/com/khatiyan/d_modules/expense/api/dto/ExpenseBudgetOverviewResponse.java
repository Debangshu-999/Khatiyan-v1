package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Budget state for one month. {@code defaultMonthlyBudgetPaise} is the recurring
 * default (null when never set); {@code raisedThisMonthPaise} is the total of
 * this month's raises; {@code effectiveBudgetPaise} = default + raised (null when
 * no budget is configured); {@code savingsPaise} is the positive remainder.
 */
public record ExpenseBudgetOverviewResponse(
        LocalDate month,
        Long defaultMonthlyBudgetPaise,
        long raisedThisMonthPaise,
        Long effectiveBudgetPaise,
        long spentPaise,
        Long remainingPaise,
        long savingsPaise,
        List<BudgetRaiseItem> raises) {
}
