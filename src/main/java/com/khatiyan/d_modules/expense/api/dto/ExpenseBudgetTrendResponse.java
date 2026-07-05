package com.khatiyan.d_modules.expense.api.dto;

import java.util.List;

/** Trailing-window budget trend (oldest month first, selected month last). */
public record ExpenseBudgetTrendResponse(List<ExpenseBudgetTrendPoint> points) {
}
