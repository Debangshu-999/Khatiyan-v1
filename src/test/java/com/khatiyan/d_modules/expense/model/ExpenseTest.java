package com.khatiyan.d_modules.expense.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/** Only this month's expenses can be reversed (user, 2026-11-01). */
class ExpenseTest {

    @Test
    void anExpenseIsBeforeAMonthOnlyWhenItsOwnMonthIsEarlier() {
        YearMonth november = YearMonth.of(2026, 11);

        assertThat(on(LocalDate.of(2026, 10, 31)).incurredBefore(november)).isTrue();
        assertThat(on(LocalDate.of(2025, 11, 15)).incurredBefore(november)).isTrue();
        assertThat(on(LocalDate.of(2026, 11, 1)).incurredBefore(november)).isFalse();
    }

    private static Expense on(LocalDate incurredDate) {
        return Expense.manual(UUID.randomUUID(), UUID.randomUUID(), "Water Supplier", 8_000_00L, incurredDate, null, UUID.randomUUID());
    }
}
