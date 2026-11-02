package com.khatiyan.d_modules.expense.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/** A template holds no day of its own (user, 2026-11-01), and still generates once a month. */
class RecurringExpenseTest {

    @Test
    void itGeneratesOnceForEachMonth() {
        RecurringExpense water = RecurringExpense.create(
                UUID.randomUUID(), UUID.randomUUID(), "Water Supplier", 8_000_00L, null, UUID.randomUUID());
        LocalDate november = LocalDate.of(2026, 11, 1);

        assertThat(water.shouldGenerateFor(november)).isTrue();
        water.markGeneratedFor(november);
        assertThat(water.shouldGenerateFor(november.plusDays(20))).isFalse();
        assertThat(water.shouldGenerateFor(LocalDate.of(2026, 12, 1))).isTrue();
    }
}
