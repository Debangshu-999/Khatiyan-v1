package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Budget state for one month. {@code defaultMonthlyBudgetPaise} is the recurring
 * fixed amount (null when never set); {@code raisedThisMonthPaise} is the total of
 * this month's raises; {@code effectiveBudgetPaise} = fixed + from income + raised
 * (null when no budget is configured); {@code savingsPaise} is the positive remainder.
 *
 * <p>The income share (2026-10-18): {@code incomeMode} NONE, FULL or PART,
 * {@code incomePartPaise} for PART, {@code incomeReceivedPaise} the money
 * received that month, and {@code fromIncomePaise} what the share adds.
 */
public record ExpenseBudgetOverviewResponse(
        LocalDate month,
        Long defaultMonthlyBudgetPaise,
        long raisedThisMonthPaise,
        Long effectiveBudgetPaise,
        long spentPaise,
        Long remainingPaise,
        long savingsPaise,
        List<BudgetRaiseItem> raises,
        /** The budget settings' version (2026-09-29), sent back as If-Match on a new default. */
        long version,
        com.khatiyan.d_modules.expense.model.BudgetIncomeMode incomeMode,
        Long incomePartPaise,
        long incomeReceivedPaise,
        long fromIncomePaise) {
}
