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
    void anIndefiniteAgreementHasNoTermAndNoEndDate() {
        Tenancy tenancy = monthlyTenancy();
        tenancy.stampAgreementTerms(null, null);

        assertThat(tenancy.hasFixedTerm()).isFalse();
        assertThat(tenancy.getAgreementEndDate()).isNull();
        // Nothing schedules an end, so it closes only through an exit request.
        assertThat(tenancy.getPlannedEndDate()).isNull();
    }

    @Test
    void aFixedTermCarriesItsEndDateFromTheStart() {
        Tenancy tenancy = monthlyTenancy(); // starts 2026-06-01
        tenancy.stampAgreementTerms(6, "One month's rent, deducted from the deposit.");

        assertThat(tenancy.hasFixedTerm()).isTrue();
        assertThat(tenancy.getAgreementEndDate()).isEqualTo(LocalDate.of(2026, 12, 1));
        // The planned end is what puts it into Upcoming exits without any job
        // discovering it later — the same shape a daily stay already uses.
        assertThat(tenancy.getPlannedEndDate()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(tenancy.getEarlyExitRule()).isEqualTo("One month's rent, deducted from the deposit.");
    }

    @Test
    void leavingBeforeTheTermEndsIsEarly_andOnTheEndDateIsNot() {
        Tenancy tenancy = monthlyTenancy();
        tenancy.stampAgreementTerms(3, "As per policy.");

        assertThat(tenancy.isWithinTerm(LocalDate.of(2026, 8, 15))).isTrue();
        // The term was served, so the last day is not an early exit. The old
        // engine charged a full penalty here through an off-by-one.
        assertThat(tenancy.isWithinTerm(LocalDate.of(2026, 9, 1))).isFalse();
        assertThat(tenancy.isWithinTerm(LocalDate.of(2026, 10, 1))).isFalse();
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
