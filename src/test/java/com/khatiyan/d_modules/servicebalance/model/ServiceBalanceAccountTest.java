package com.khatiyan.d_modules.servicebalance.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The money rules, which live entirely in the entity.
 *
 * <p>Every one of these is a case where getting it wrong means inventing or
 * losing a real rupee, so they are asserted here rather than trusted to the
 * callers that happen to exist today.
 */
class ServiceBalanceAccountTest {

    private ServiceBalanceAccount account() {
        return ServiceBalanceAccount.open(UUID.randomUUID());
    }

    private ServiceBalanceAccount accountWith(long availablePaise) {
        ServiceBalanceAccount account = account();
        account.credit(availablePaise);
        return account;
    }

    @Test
    void aNewAccountHoldsNothing() {
        ServiceBalanceAccount account = account();

        assertThat(account.getAvailablePaise()).isZero();
        assertThat(account.getReservedPaise()).isZero();
        assertThat(account.totalPaise()).isZero();
    }

    @Test
    void creditingAddsToSpendable() {
        ServiceBalanceAccount account = accountWith(50_000L);

        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
        assertThat(account.totalPaise()).isEqualTo(50_000L);
    }

    @Test
    void reservingMovesMoneyOutOfSpendableWithoutSpendingIt() {
        ServiceBalanceAccount account = accountWith(50_000L);

        account.reserve(3_000L);

        assertThat(account.getAvailablePaise()).isEqualTo(47_000L);
        assertThat(account.getReservedPaise()).isEqualTo(3_000L);
        // Still the owner's money. A hold is not a spend.
        assertThat(account.totalPaise()).isEqualTo(50_000L);
    }

    @Test
    void reservingMoreThanIsAvailableIsRefused() {
        ServiceBalanceAccount account = accountWith(2_000L);

        assertThatThrownBy(() -> account.reserve(2_001L))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Add money");

        assertThat(account.getAvailablePaise()).isEqualTo(2_000L);
        assertThat(account.getReservedPaise()).isZero();
    }

    @Test
    void releasingPutsTheHoldBack() {
        ServiceBalanceAccount account = accountWith(50_000L);
        account.reserve(3_000L);

        account.release(3_000L);

        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
        assertThat(account.getReservedPaise()).isZero();
    }

    @Test
    void releasingMoreThanIsHeldIsRefused() {
        ServiceBalanceAccount account = accountWith(50_000L);
        account.reserve(3_000L);

        assertThatThrownBy(() -> account.release(3_001L)).isInstanceOf(ValidationException.class);

        assertThat(account.getReservedPaise()).isEqualTo(3_000L);
    }

    @Test
    void chargingSpendsTheHoldAndNothingElse() {
        ServiceBalanceAccount account = accountWith(50_000L);
        account.reserve(3_000L);

        account.charge(3_000L);

        assertThat(account.getReservedPaise()).isZero();
        // Spendable is untouched: a charge consumes what was held for it.
        assertThat(account.getAvailablePaise()).isEqualTo(47_000L);
        assertThat(account.totalPaise()).isEqualTo(47_000L);
    }

    @Test
    void chargingWithoutAHoldIsRefused() {
        ServiceBalanceAccount account = accountWith(50_000L);

        assertThatThrownBy(() -> account.charge(1_000L))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("not being held");

        assertThat(account.getAvailablePaise()).isEqualTo(50_000L);
    }

    @Test
    void debitingTakesOnlyFromSpendableMoney() {
        ServiceBalanceAccount account = accountWith(50_000L);
        account.reserve(10_000L);

        // A refund cannot reach into money promised to work already in flight.
        assertThatThrownBy(() -> account.debit(45_000L)).isInstanceOf(ValidationException.class);

        account.debit(40_000L);
        assertThat(account.getAvailablePaise()).isZero();
        assertThat(account.getReservedPaise()).isEqualTo(10_000L);
    }

    @Test
    void zeroAndNegativeAmountsAreRefusedEverywhere() {
        ServiceBalanceAccount account = accountWith(10_000L);

        assertThatThrownBy(() -> account.credit(0L)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> account.reserve(-1L)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> account.release(0L)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> account.charge(-100L)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> account.debit(0L)).isInstanceOf(ValidationException.class);
    }

    @Test
    void anAccountAlwaysNeedsAnOwner() {
        assertThatThrownBy(() -> ServiceBalanceAccount.open(null)).isInstanceOf(ValidationException.class);
    }

    // ---- spending: the provider is paid by us, the balance records it --------

    @Test
    void spendingTakesFromSpendableMoney() {
        ServiceBalanceAccount account = accountWith(50_000L);

        ServiceSpendSplit split = account.spend(1_500L);

        assertThat(split.fromAvailablePaise()).isEqualTo(1_500L);
        assertThat(split.toOutstandingPaise()).isZero();
        assertThat(account.getAvailablePaise()).isEqualTo(48_500L);
        assertThat(account.getOutstandingPaise()).isZero();
    }

    /**
     * The work has already run and the provider has already billed us, so an
     * empty balance cannot refuse the charge — it can only record it as a debt.
     */
    @Test
    void spendingWithNothingBehindItBecomesADebt() {
        ServiceBalanceAccount account = account();

        ServiceSpendSplit split = account.spend(1_500L);

        assertThat(split.fromAvailablePaise()).isZero();
        assertThat(split.toOutstandingPaise()).isEqualTo(1_500L);
        assertThat(account.getAvailablePaise()).isZero();
        assertThat(account.getOutstandingPaise()).isEqualTo(1_500L);
    }

    /**
     * The case that made a direct spend necessary. Routing the whole charge to
     * dues because it did not fit would leave the owner with money they had
     * already spent still showing as spendable.
     */
    @Test
    void spendingMoreThanIsLeftSplitsAcrossBoth() {
        ServiceBalanceAccount account = accountWith(1_000L);

        ServiceSpendSplit split = account.spend(1_500L);

        assertThat(split.fromAvailablePaise()).isEqualTo(1_000L);
        assertThat(split.toOutstandingPaise()).isEqualTo(500L);
        assertThat(account.getAvailablePaise()).isZero();
        assertThat(account.getOutstandingPaise()).isEqualTo(500L);
    }

    @Test
    void spendingNeverTouchesHeldMoney() {
        ServiceBalanceAccount account = accountWith(50_000L);
        account.reserve(10_000L);

        account.spend(1_500L);

        assertThat(account.getReservedPaise()).isEqualTo(10_000L);
        assertThat(account.getAvailablePaise()).isEqualTo(38_500L);
    }

    @Test
    void spendingNothingIsRefused() {
        ServiceBalanceAccount account = accountWith(50_000L);

        assertThatThrownBy(() -> account.spend(0L)).isInstanceOf(ValidationException.class);
    }
}
