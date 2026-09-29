package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** The one checkout date, and the Pending exit state (spec 2026-09-26-pending-exit-design). */
class TenancyPendingExitTest {

    private static final LocalDate START = LocalDate.of(2026, 8, 20);

    private static Tenancy monthly() {
        return Tenancy.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 800000, 100000, START);
    }

    @Test
    void theCheckoutDateIsTheNoticeEndOrElseThePlannedEnd() {
        Tenancy indefinite = monthly();
        assertThat(indefinite.checkoutDate()).isNull();

        // A fixed term carries its end from the start, in plannedEndDate: this was the date nothing read.
        Tenancy fixed = monthly();
        fixed.stampAgreementTerms(1, null);
        assertThat(fixed.checkoutDate()).isEqualTo(LocalDate.of(2026, 9, 20));

        Tenancy notice = monthly();
        notice.scheduleEndDate(LocalDate.of(2026, 10, 19));
        assertThat(notice.checkoutDate()).isEqualTo(LocalDate.of(2026, 10, 19));

        Tenancy daily = monthly();
        ReflectionTestUtils.setField(daily, "billingType", TenancyBillingType.DAILY);
        ReflectionTestUtils.setField(daily, "plannedEndDate", LocalDate.of(2026, 8, 23));
        assertThat(daily.checkoutDate()).isEqualTo(LocalDate.of(2026, 8, 23));
    }

    @Test
    void aStayIsPastCheckoutFromTheDayAfterNotOnTheDay() {
        Tenancy fixed = monthly();
        fixed.stampAgreementTerms(1, null);
        assertThat(fixed.isPastCheckout(LocalDate.of(2026, 9, 20))).isFalse();
        assertThat(fixed.isPastCheckout(LocalDate.of(2026, 9, 21))).isTrue();
        assertThat(monthly().isPastCheckout(LocalDate.of(2030, 1, 1))).isFalse();
    }

    @Test
    void pendingExitHaltsEverythingButCanStillBeEnded() {
        Tenancy fixed = monthly();
        fixed.stampAgreementTerms(1, null);
        fixed.markPendingExit();
        assertThat(fixed.getStatus()).isEqualTo(TenancyStatus.PENDING_EXIT);
        // Still a current stay holding its bed, but no longer "currently active": every guard built on that refuses.
        assertThat(fixed.isActive()).isTrue();
        assertThat(fixed.isCurrentlyActive()).isFalse();
        assertThatThrownBy(fixed::markOnNotice).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(fixed::markPendingExit).isInstanceOf(IllegalStateException.class);

        fixed.end(LocalDate.of(2026, 9, 26), "Agreement ended");
        assertThat(fixed.getStatus()).isEqualTo(TenancyStatus.EXITED);
        assertThat(fixed.isActive()).isFalse();
    }

    @Test
    void endingSoonLeadTimeScalesWithTheTerm() {
        assertThat(Tenancy.leadDaysFor(null)).isEqualTo(7);
        assertThat(Tenancy.leadDaysFor(1)).isEqualTo(7);
        assertThat(Tenancy.leadDaysFor(2)).isEqualTo(7);
        assertThat(Tenancy.leadDaysFor(3)).isEqualTo(15);
        assertThat(Tenancy.leadDaysFor(5)).isEqualTo(15);
        assertThat(Tenancy.leadDaysFor(6)).isEqualTo(30);
        assertThat(Tenancy.leadDaysFor(12)).isEqualTo(30);
    }
}
