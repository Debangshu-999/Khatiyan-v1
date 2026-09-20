package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * Cancelling a one-off bill: allowed only while the tenant still owes it.
 */
class BillingCycleCancelOneOffTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-09-14T06:00:00Z");

    private BillingCycle oneOff(BillingCycleStatus status) {
        BillingCycle bill = BillingCycle.createOneOff(
                UUID.randomUUID(), "BIL-TEST", UUID.randomUUID(), "Tenant", UUID.randomUUID(),
                UUID.randomUUID(), TenancyBillingType.MONTHLY, LocalDate.of(2026, 9, 14));
        ReflectionTestUtils.setField(bill, "status", status);
        return bill;
    }

    @Test
    @DisplayName("an unpaid one-off bill is cancelled with its reason and who cancelled it")
    void cancelsUnpaid() {
        BillingCycle bill = oneOff(BillingCycleStatus.UNPAID);

        bill.cancelOneOff("Wrong amount", ACTOR, NOW);

        assertThat(bill.getStatus()).isEqualTo(BillingCycleStatus.CANCELLED);
        assertThat(bill.getCancellationReason()).isEqualTo("Wrong amount");
        assertThat(bill.getCancelledByUserId()).isEqualTo(ACTOR);
        assertThat(bill.getCancelledAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("an overdue one-off bill can be cancelled")
    void cancelsOverdue() {
        BillingCycle bill = oneOff(BillingCycleStatus.OVERDUE);

        bill.cancelOneOff("Charged twice", ACTOR, NOW);

        assertThat(bill.getStatus()).isEqualTo(BillingCycleStatus.CANCELLED);
    }

    @Test
    @DisplayName("a bill the tenant has reported paying is refused until the claim is decided")
    void refusesAwaitingConfirmation() {
        BillingCycle bill = oneOff(BillingCycleStatus.CONFIRMATION_PENDING);

        assertThatThrownBy(() -> bill.cancelOneOff("Wrong amount", ACTOR, NOW))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Confirm or reject their payment first");
        assertThat(bill.getStatus()).isEqualTo(BillingCycleStatus.CONFIRMATION_PENDING);
    }

    @Test
    @DisplayName("a paid bill cannot be cancelled")
    void refusesPaid() {
        BillingCycle bill = oneOff(BillingCycleStatus.PAID);

        assertThatThrownBy(() -> bill.cancelOneOff("Wrong amount", ACTOR, NOW))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("paid bill");
    }

    @Test
    @DisplayName("a rent cycle is never cancelled this way")
    void refusesRentCycle() {
        BillingCycle bill = oneOff(BillingCycleStatus.UNPAID);
        ReflectionTestUtils.setField(bill, "category", BillingCycleCategory.RENT_CYCLE);

        assertThatThrownBy(() -> bill.cancelOneOff("Wrong amount", ACTOR, NOW))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only one-off bills");
    }
}
