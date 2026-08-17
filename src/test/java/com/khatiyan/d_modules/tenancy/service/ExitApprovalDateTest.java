package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Approving an exit fixes the tenant's date, and only if it is still ahead.
 *
 * <p>Both halves were missing. Approval accepted an owner-supplied date and let
 * it be pulled earlier, so an owner could move someone's last day without
 * agreement; and there was no lower bound at all, so it accepted today, or a
 * date already past, ending a tenancy retroactively.
 *
 * <p>The second half is not just about a malicious payload. A request can sit
 * unreviewed for days — the review window is five — so one raised for tomorrow
 * and approved next week would fix a checkout in the past through the ordinary
 * flow, with everything downstream reading it as already due.
 */
class ExitApprovalDateTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 17);
    private static final LocalDate REQUESTED = LocalDate.of(2026, 8, 25);

    @Test
    void takesTheRequestedDateWhenTheOwnerSendsNothing() {
        assertThat(TenancyExitRequestService.resolveApprovedCheckoutDate(REQUESTED, null, TODAY))
                .isEqualTo(REQUESTED);
    }

    /** Sending the same date back is agreement, not a change. */
    @Test
    void acceptsTheRequestedDateSentBackUnchanged() {
        assertThat(TenancyExitRequestService.resolveApprovedCheckoutDate(REQUESTED, REQUESTED, TODAY))
                .isEqualTo(REQUESTED);
    }

    @Test
    void refusesADateBroughtForward() {
        assertThatThrownBy(() -> TenancyExitRequestService.resolveApprovedCheckoutDate(
                REQUESTED, REQUESTED.minusDays(3), TODAY))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("cannot be changed while approving");
    }

    @Test
    void refusesADatePushedBack() {
        assertThatThrownBy(() -> TenancyExitRequestService.resolveApprovedCheckoutDate(
                REQUESTED, REQUESTED.plusDays(3), TODAY))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("cannot be changed while approving");
    }

    /**
     * The case that reaches production without anyone acting oddly: the request
     * simply aged past its own date while waiting for a decision.
     */
    @Test
    void refusesApprovingARequestWhoseDateHasPassed() {
        assertThatThrownBy(() -> TenancyExitRequestService.resolveApprovedCheckoutDate(
                LocalDate.of(2026, 8, 10), null, TODAY))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no longer in the future");
    }

    /** Today is not far enough ahead — the tenancy would end the day it is approved. */
    @Test
    void refusesApprovingForToday() {
        assertThatThrownBy(() -> TenancyExitRequestService.resolveApprovedCheckoutDate(TODAY, null, TODAY))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no longer in the future");
    }

    @Test
    void allowsTomorrow() {
        assertThatCode(() -> TenancyExitRequestService.resolveApprovedCheckoutDate(
                TODAY.plusDays(1), null, TODAY))
                .doesNotThrowAnyException();
    }
}
