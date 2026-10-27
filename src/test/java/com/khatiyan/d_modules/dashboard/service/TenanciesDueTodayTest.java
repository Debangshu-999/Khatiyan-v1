package com.khatiyan.d_modules.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardMonths;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.concerns.api.dto.ConcernDashboardSummary;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.expense.ExpenseModule;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.staff.StaffModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;
import com.khatiyan.d_modules.tenancy.model.Tenancy;

class TenanciesDueTodayTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 18);
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ROOM = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();

    private static Tenancy monthly(LocalDate start) {
        return Tenancy.start(UUID.randomUUID(), PROPERTY, ROOM, OWNER, 800_000, 1_000_000, start);
    }

    private static Tenancy fixedTermEnding(LocalDate date) {
        Tenancy stay = monthly(date.minusMonths(1));
        stay.stampAgreementTerms(1, null);
        return stay;
    }

    @Test
    void fixedTermDueTodayNeedsNoExitRequest() {
        Tenancy stay = fixedTermEnding(TODAY);
        assertThat(stay.getEndDate()).isNull();
        assertThat(count(stay)).isEqualTo(1);
    }

    @Test
    void dailyGuestCheckoutIsCounted() {
        GuestDetails guest = new GuestDetails("Test guest", "+919000000001", null, "Test address", 25, Gender.MALE);
        Tenancy stay = Tenancy.startDailyGuest("TEN-TEST", PROPERTY, ROOM, OWNER, 50_000,
                TODAY.minusDays(2), TODAY, guest);
        assertThat(count(stay)).isEqualTo(1);
    }

    @Test
    void normalAndPrematureNoticeUseTheirActualCheckoutDate() {
        Tenancy normal = monthly(TODAY.minusMonths(2));
        normal.markOnNotice();
        normal.scheduleEndDate(TODAY);
        Tenancy early = fixedTermEnding(TODAY.plusDays(10));
        early.markOnPrematureNotice();
        early.scheduleEndDate(TODAY);
        assertThat(count(normal, early)).isEqualTo(2);
    }

    @Test
    void anEarlierNoticeOverridesAPlannedEndToday() {
        Tenancy stay = fixedTermEnding(TODAY);
        stay.markOnNotice();
        stay.scheduleEndDate(TODAY.minusDays(1));
        assertThat(count(stay)).isZero();
    }

    @Test
    void yesterdayTomorrowAndIndefiniteStaysAreNotDueToday() {
        assertThat(count(fixedTermEnding(TODAY.minusDays(1)), fixedTermEnding(TODAY.plusDays(1)),
                monthly(TODAY.minusMonths(2)))).isZero();
    }

    @Test
    void offersScheduledBookingsCancelledAndAlreadyEndedStaysAreNotDue() {
        Tenancy unsigned = fixedTermEnding(TODAY);
        unsigned.markPendingAcceptance();
        Tenancy cancelled = fixedTermEnding(TODAY);
        cancelled.markPendingAcceptance();
        cancelled.cancelPending("Declined");
        Tenancy scheduled = fixedTermEnding(TODAY);
        scheduled.markPendingAcceptance();
        scheduled.claimDepartingStay(UUID.randomUUID());
        scheduled.acceptTos();
        Tenancy ended = fixedTermEnding(TODAY);
        ended.end(TODAY, "Checked out");
        assertThat(count(unsigned, cancelled, scheduled, ended)).isZero();
    }

    @Test
    void dashboardPublishesThePropertyScopedCountInAttention() {
        PropertyModule properties = mock(PropertyModule.class);
        TenancyModule tenancies = mock(TenancyModule.class);
        BillingModule billing = mock(BillingModule.class);
        ConcernModule concerns = mock(ConcernModule.class);
        ExpenseModule expenses = mock(ExpenseModule.class);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        when(properties.getActiveProperty(PROPERTY)).thenReturn(new PropertyResponse(
                PROPERTY, "PROP-TEST", OWNER, "Test property", "Address", "Area", "City", "State", "700001",
                null, null, PropertyType.PG, PgFor.ANYONE, PreferredTenantType.ANYONE, false, Set.of(), false,
                BathroomType.COMMON, Set.of(), Set.of(), Set.of(), null, null, 0L,
                BillingCollectionTiming.CYCLE_START, 0, 0L, NoticePeriod.ONE_MONTH, 0, null, null, false, true, 0L));
        when(tenancies.findActiveByPropertyId(PROPERTY))
                .thenReturn(List.of(TenancyResponse.from(fixedTermEnding(today))));
        when(billing.getPropertyBillingSummaryForDashboard(PROPERTY))
                .thenReturn(new BillingDashboardSummary(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
        when(billing.getPropertyDashboardMonths(PROPERTY, today.withDayOfMonth(1)))
                .thenReturn(new BillingDashboardMonths(Set.of(), 0, 0, 0));
        when(concerns.getPropertyConcernSummary(OWNER, PROPERTY))
                .thenReturn(new ConcernDashboardSummary(0, 0, 0, 0, 0, 0, 0, 0, 0));
        when(expenses.budgetSnapshot(PROPERTY, today.withDayOfMonth(1)))
                .thenReturn(new ExpenseBudgetOverviewResponse(today.withDayOfMonth(1), null, 0, null, 0, null, 0, List.of(), 0,
                        com.khatiyan.d_modules.expense.model.BudgetIncomeMode.NONE, null, 0, 0));
        OwnerDashboardService service = new OwnerDashboardService(properties, tenancies, billing, concerns,
                mock(StaffModule.class), expenses, mock(EnquiryModule.class),
                mock(com.khatiyan.d_modules.booking.BookingModule.class), mock(com.khatiyan.d_modules.lead.VisitModule.class),
                7, mock(ActivityEventService.class), 10);

        assertThat(service.getPropertyActionCenter(OWNER, PROPERTY).attention().exitsDueToday()).isEqualTo(1);
        verify(properties).ensureCanManageProperty(OWNER, PROPERTY);
        verify(tenancies).findActiveByPropertyId(PROPERTY);
    }

    private static long count(Tenancy... stays) {
        return OwnerDashboardService.countExitsDueToday(
                List.of(stays).stream().map(TenancyResponse::from).toList(), TODAY);
    }
}
