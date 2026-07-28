package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class TenancyTest {

    @Test
    void monthlyTenancyStartsActiveWithBillingNotStarted() {
        Tenancy tenancy = monthlyTenancy();

        assertThat(tenancy.getBillingType()).isEqualTo(TenancyBillingType.MONTHLY);
        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.ACTIVE);
        assertThat(tenancy.isCurrentlyActive()).isTrue();
        assertThat(tenancy.isBillingStarted()).isFalse();
        assertThat(tenancy.getRentAmountPaise()).isEqualTo(12_000_00);
        assertThat(tenancy.getDepositAmountPaise()).isEqualTo(10_000_00);
    }

    @Test
    void monthlySetupTermsCanChangeBeforeBillingStarts() {
        Tenancy tenancy = monthlyTenancy();

        tenancy.updateSetupTerms(13_000_00L, 11_000_00L);

        assertThat(tenancy.getRentAmountPaise()).isEqualTo(13_000_00);
        assertThat(tenancy.getDepositAmountPaise()).isEqualTo(11_000_00);
    }

    @Test
    void setupTermsCannotChangeAfterBillingStarts() {
        Tenancy tenancy = monthlyTenancy();
        tenancy.markBillingStarted();

        assertThatThrownBy(() -> tenancy.updateSetupTerms(13_000_00L, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Tenancy billing has already started");
    }

    @Test
    void dailyTenancyMustBeLessThanThirtyDays() {
        LocalDate startDate = LocalDate.of(2026, 6, 1);

        assertThatThrownBy(() -> Tenancy.startDaily(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                1_000_00,
                startDate,
                startDate.plusDays(30)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Daily tenancy must be less than 30 days");
    }

    @Test
    void noticeStatesRemainCurrentlyActive() {
        Tenancy tenancy = monthlyTenancy();

        tenancy.markOnNotice();
        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.ON_NOTICE);
        assertThat(tenancy.isCurrentlyActive()).isTrue();

        tenancy.markOnPrematureNotice();
        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.ON_PREMATURE_NOTICE);
        assertThat(tenancy.isCurrentlyActive()).isTrue();
    }

    @Test
    void endingTenancyMarksItInactiveAndBlocksSecondEnd() {
        Tenancy tenancy = monthlyTenancy();

        tenancy.end(LocalDate.of(2026, 6, 20), "Checkout complete");

        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.EXITED);
        assertThat(tenancy.isCurrentlyActive()).isFalse();
        assertThat(tenancy.isActive()).isFalse();
        assertThat(tenancy.getEndDate()).isEqualTo(LocalDate.of(2026, 6, 20));

        assertThatThrownBy(() -> tenancy.end(LocalDate.of(2026, 6, 21), "duplicate"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Cannot end a tenancy that is not active");
    }

    @Test
    void roomTransferChangesRoomAndRentOnlyForMonthlyActiveTenancy() {
        Tenancy tenancy = monthlyTenancy();
        UUID newRoomId = UUID.randomUUID();

        tenancy.transferRoom(newRoomId, 14_000_00);

        assertThat(tenancy.getRoomId()).isEqualTo(newRoomId);
        assertThat(tenancy.getRentAmountPaise()).isEqualTo(14_000_00);
    }

    @Test
    void tenancyWithoutStampedTermsIsNotAgreementBackedAndHasNoPenalty() {
        Tenancy tenancy = monthlyTenancy();

        assertThat(tenancy.isAgreementBacked()).isFalse();
        assertThat(tenancy.earlyExitPenaltyPaise(LocalDate.of(2026, 7, 1))).isZero();
    }

    @Test
    void remainingTermPenaltyProratesRemainingLockInDaysOverThirty() {
        Tenancy tenancy = monthlyTenancy(); // rent 12,000; start 2026-06-01
        // 3-month lock-in -> ends 2026-09-01.
        tenancy.stampAgreementExitTerms(LocalDate.of(2026, 9, 1), EarlyExitPenaltyType.REMAINING_TERM, null);

        assertThat(tenancy.isAgreementBacked()).isTrue();
        // 15 days remain (2026-08-17 -> 2026-09-01): 12,000 * 15/30 = 6,000.
        assertThat(tenancy.earlyExitPenaltyPaise(LocalDate.of(2026, 8, 17))).isEqualTo(6_000_00);
    }

    @Test
    void fixedPenaltyReturnsTheFlatAmountWhileInsideLockIn() {
        Tenancy tenancy = monthlyTenancy();
        tenancy.stampAgreementExitTerms(LocalDate.of(2026, 9, 1), EarlyExitPenaltyType.FIXED, 5_000_00L);

        assertThat(tenancy.earlyExitPenaltyPaise(LocalDate.of(2026, 8, 1))).isEqualTo(5_000_00);
    }

    @Test
    void noPenaltyOnceLockInHasBeenServed() {
        Tenancy tenancy = monthlyTenancy();
        tenancy.stampAgreementExitTerms(LocalDate.of(2026, 9, 1), EarlyExitPenaltyType.FIXED, 5_000_00L);

        // Checkout on the lock-in end date and after it both carry no penalty.
        assertThat(tenancy.earlyExitPenaltyPaise(LocalDate.of(2026, 9, 1))).isZero();
        assertThat(tenancy.earlyExitPenaltyPaise(LocalDate.of(2026, 10, 1))).isZero();
    }

    private static Tenancy monthlyTenancy() {
        return Tenancy.start(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 6, 1));
    }
}
