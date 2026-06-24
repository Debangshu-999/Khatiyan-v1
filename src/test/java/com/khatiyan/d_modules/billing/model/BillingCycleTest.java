package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

class BillingCycleTest {

    @Test
    void recalculatesMonthlyFirstCycleWithRentAndDeposit() {
        BillingCycle cycle = monthlyCycle(1, LocalDate.of(2026, 6, 1));

        cycle.recalculateTotals(12_000_00, 10_000_00, 0, 0, 0);

        assertThat(cycle.getBaseAmountPaise()).isEqualTo(12_000_00);
        assertThat(cycle.getTotalAmountPaise()).isEqualTo(22_000_00);
        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.UNPAID);
    }

    @Test
    void rejectsFirstCycleDiscountThatMakesPayableLessThanDeposit() {
        BillingCycle cycle = monthlyCycle(1, LocalDate.of(2026, 6, 1));

        assertThatThrownBy(() -> cycle.recalculateTotals(12_000_00, 10_000_00, 0, 0, 13_000_00))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("First billing cycle payable amount cannot be less than deposit amount");
    }

    @Test
    void marksCycleOverdueOnlyAfterDueDate() {
        BillingCycle cycle = monthlyCycle(2, LocalDate.of(2026, 6, 1));

        cycle.markOverdue(LocalDate.of(2026, 6, 4));
        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.UNPAID);

        cycle.markOverdue(LocalDate.of(2026, 6, 5));
        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.OVERDUE);
    }

    @Test
    void carriesOverdueCycleForwardAsUnpaidWhenNextCycleStarts() {
        BillingCycle cycle = monthlyCycle(2, LocalDate.of(2026, 6, 1));

        cycle.markOverdue(LocalDate.of(2026, 6, 5));
        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.OVERDUE);

        cycle.markUnpaidAfterOverdueWindow(LocalDate.of(2026, 7, 1));

        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.UNPAID);
        cycle.markOverdue(LocalDate.of(2026, 7, 2));
        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.UNPAID);
    }

    @Test
    void paidCycleCannotBeRecalculatedOrCancelled() {
        BillingCycle cycle = monthlyCycle(2, LocalDate.of(2026, 6, 1));
        cycle.recalculateTotals(12_000_00, 0, 0, 0, 0);

        cycle.markPaid(Instant.parse("2026-06-01T10:00:00Z"));

        assertThat(cycle.isPaid()).isTrue();
        assertThatThrownBy(() -> cycle.recalculateTotals(12_000_00, 0, 100_00, 0, 0))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Paid billing cycle cannot be edited");
        assertThatThrownBy(cycle::cancel)
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Paid billing cycle cannot be edited");
    }

    @Test
    void extraChargesAreEditableBeforeLockedDayAndAfterDueDate() {
        BillingCycle cycle = monthlyCycle(2, LocalDate.of(2026, 6, 1));

        assertThat(cycle.isEditableForExtraCharges(LocalDate.of(2026, 6, 2))).isTrue();
        assertThat(cycle.isEditableForExtraCharges(LocalDate.of(2026, 6, 3))).isFalse();
        assertThat(cycle.isEditableForExtraCharges(LocalDate.of(2026, 6, 5))).isTrue();
    }

    private static BillingCycle monthlyCycle(int cycleNumber, LocalDate periodStartDate) {
        return BillingCycle.create(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Test Tenant",
                UUID.randomUUID(),
                UUID.randomUUID(),
                TenancyBillingType.MONTHLY,
                cycleNumber,
                periodStartDate,
                periodStartDate.plusMonths(1).minusDays(1),
                periodStartDate.plusDays(3),
                BillingCollectionTiming.CYCLE_START,
                3);
    }
}
