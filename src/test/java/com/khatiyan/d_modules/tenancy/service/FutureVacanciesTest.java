package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;

/** When a stay's bed can be booked ahead (owner's rule, 2026-09-27): certain to end, and ending soon. */
class FutureVacanciesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 27);
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ROOM = UUID.randomUUID();

    private static Tenancy stay(LocalDate start) {
        return Tenancy.start(UUID.randomUUID(), PROPERTY, ROOM, UUID.randomUUID(), 12_000_00, 10_000_00, start);
    }

    /** A term of {@code months} that ends {@code daysLeft} days from today. */
    private static Tenancy fixedTerm(int months, int daysLeft) {
        Tenancy stay = stay(TODAY.plusDays(daysLeft).minusMonths(months));
        stay.stampAgreementTerms(months, null);
        return stay;
    }

    private static TenancyExitRequest exit(TenancyExitRequestStatus status, boolean windowOpen) {
        TenancyExitRequest request = mock(TenancyExitRequest.class);
        when(request.getStatus()).thenReturn(status);
        if (status == TenancyExitRequestStatus.APPROVED) {
            when(request.withdrawalWindowOpen(TODAY)).thenReturn(windowOpen);
        }
        return request;
    }

    private static LocalDate from(Tenancy stay, TenancyExitRequest... requests) {
        return FutureVacancies.departingStayAvailableFrom(stay, List.of(requests), false, TODAY);
    }

    @Test
    void aFixedTermIsBookableOnlyInsideItsEndsSoonWindow() {
        // One month: 7 days ahead. Six months: 30 days ahead.
        assertThat(from(fixedTerm(1, 7))).isEqualTo(TODAY.plusDays(7));
        assertThat(from(fixedTerm(1, 8))).isNull();
        assertThat(from(fixedTerm(6, 30))).isEqualTo(TODAY.plusDays(30));
        assertThat(from(fixedTerm(6, 31))).isNull();
    }

    @Test
    void anIndefiniteStayIsNotCertainToEndWithoutAnApprovedExit() {
        assertThat(from(stay(TODAY.minusMonths(3)))).isNull();
    }

    @Test
    void anApprovedNoticeCountsOnlyOnceTheTenantCanNoLongerWithdrawIt() {
        Tenancy notice = stay(TODAY.minusMonths(3));
        notice.markOnNotice();
        notice.scheduleEndDate(TODAY.plusDays(5));

        assertThat(from(notice, exit(TenancyExitRequestStatus.APPROVED, true))).isNull();
        assertThat(from(notice, exit(TenancyExitRequestStatus.APPROVED, false))).isEqualTo(TODAY.plusDays(5));
        // A notice is 7 days ahead, like the Ends-soon badge.
        Tenancy farNotice = stay(TODAY.minusMonths(3));
        farNotice.markOnNotice();
        farNotice.scheduleEndDate(TODAY.plusDays(20));
        assertThat(from(farNotice, exit(TenancyExitRequestStatus.APPROVED, false))).isNull();
    }

    @Test
    void aWithdrawalAwaitingTheOwnerMakesTheDateUncertain() {
        Tenancy fixed = fixedTerm(1, 3);
        assertThat(from(fixed, exit(TenancyExitRequestStatus.WITHDRAWAL_REQUESTED, false))).isNull();
    }

    @Test
    void aStayPastItsCheckoutIsBookableFromToday() {
        Tenancy overdue = fixedTerm(1, -2);
        overdue.markPendingExit();
        assertThat(from(overdue)).isEqualTo(TODAY);
    }

    @Test
    void aStayWithAnApprovedMoveIsOfferedThroughTheMoveNotHere() {
        assertThat(FutureVacancies.departingStayAvailableFrom(fixedTerm(1, 3), List.of(), true, TODAY)).isNull();
    }

    @Test
    void anEndedStayOrADailyGuestIsNeverADeparture() {
        Tenancy ended = fixedTerm(1, 3);
        ended.end(TODAY, "MANUAL_END");
        assertThat(from(ended)).isNull();

        Tenancy guest = Tenancy.startDailyGuest("TEN-X", PROPERTY, ROOM, UUID.randomUUID(), 800_00,
                TODAY.minusDays(1), TODAY.plusDays(2),
                new GuestDetails("Ravi Menon", "9007433360", null, "12 Nandidurga Road", 29, Gender.MALE));
        assertThat(from(guest)).isNull();
    }
}
