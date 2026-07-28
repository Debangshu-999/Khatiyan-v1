package com.khatiyan.d_modules.expense.api.dto;

/** One labelled line in a P&L breakdown (an income source or an expense category). */
public record PnlLine(String label, long amountPaise) {
}
