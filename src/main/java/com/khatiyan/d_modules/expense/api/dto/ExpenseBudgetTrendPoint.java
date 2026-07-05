package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;

/**
 * One month of the budget trend. {@code savingsPaise} is signed here (unlike the
 * clamped savings on the overview): positive when spend is under the effective
 * budget, negative when it is over — so the trend chart can dip below zero.
 * {@code effectiveBudgetPaise} is null for months with no budget at all.
 */
public record ExpenseBudgetTrendPoint(
        LocalDate month,
        long spentPaise,
        Long effectiveBudgetPaise,
        long savingsPaise,
        long raisedPaise) {
}
