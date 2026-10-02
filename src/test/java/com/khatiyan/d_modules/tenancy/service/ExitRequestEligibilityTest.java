package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ExitRequestEligibilityTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 10);

    @Test
    @DisplayName("every exit starts at least ten days from today")
    void minimumLeadTimeIsTenDays() {
        assertThat(TenancyExitRequestService.minimumCheckoutDate(TODAY))
                .isEqualTo(LocalDate.of(2026, 9, 20));
    }

    @Test
    @DisplayName("premature exit is unavailable in cycle one")
    void firstCycleDoesNotAllowPrematureExit() {
        assertThat(TenancyExitRequestService.prematureExitAllowed(1)).isFalse();
        assertThat(TenancyExitRequestService.prematureExitAllowed(2)).isTrue();
    }

    @Test
    void fixedTermEligibilityDependsOnAgreementLength() {
        assertThat(TenancyExitRequestService.earlyExitAllowed(1, TODAY.minusMonths(2), 3, TODAY)).isFalse();
        assertThat(TenancyExitRequestService.earlyExitAllowed(2, TODAY.minusDays(1), 1, TODAY)).isTrue();
        assertThat(TenancyExitRequestService.earlyExitAllowed(11, TODAY.minusDays(1), 1, TODAY)).isTrue();
    }

    @Test
    void indefiniteStayAllowsEarlyExitAtEitherSecondCycleOrSecondMonth() {
        LocalDate start = TODAY.minusMonths(1);
        assertThat(TenancyExitRequestService.earlyExitAllowed(null, start, 1, TODAY.minusDays(1))).isFalse();
        assertThat(TenancyExitRequestService.earlyExitAllowed(null, start, 1, TODAY)).isTrue();
        assertThat(TenancyExitRequestService.earlyExitAllowed(null, TODAY.minusDays(10), 2, TODAY)).isTrue();
        assertThat(TenancyExitRequestService.earlyExitAllowed(null, TODAY.minusDays(10), 1, TODAY)).isFalse();
    }

    @Test
    @DisplayName("cycle one clamps the picker to the full-notice date")
    void firstCycleUsesFullNoticeAsItsFloor() {
        LocalDate leadFloor = LocalDate.of(2026, 9, 20);
        LocalDate fullNotice = LocalDate.of(2026, 9, 30);

        assertThat(TenancyExitRequestService.earliestPermittedDate(leadFloor, fullNotice, false))
                .isEqualTo(fullNotice);
        assertThat(TenancyExitRequestService.earliestPermittedDate(leadFloor, fullNotice, true))
                .isEqualTo(leadFloor);
    }
}
