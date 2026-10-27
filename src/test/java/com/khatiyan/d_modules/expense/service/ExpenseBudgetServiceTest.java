package com.khatiyan.d_modules.expense.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.api.dto.SetDefaultBudgetRequest;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.expense.model.BudgetIncomeMode;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetVersion;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetRaiseRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetSettingsRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetVersionRepository;

/**
 * Editing the budget changes it from now on, never for months already run.
 *
 * <p>Reported 2026-09-13: raising the default showed the new figure against
 * every past month, so a month that ran on one budget reported its savings
 * against another.
 */
class ExpenseBudgetServiceTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final LocalDate THIS_MONTH = YearMonth.now(ZoneId.of("Asia/Kolkata")).atDay(1);

    private ExpenseBudgetSettingsRepository settingsRepository;
    private ExpenseBudgetVersionRepository versionRepository;
    private BillingModule billingModule;
    private IncomeService incomeService;
    private ExpenseBudgetService service;

    @BeforeEach
    void setUp() {
        settingsRepository = mock(ExpenseBudgetSettingsRepository.class);
        versionRepository = mock(ExpenseBudgetVersionRepository.class);
        billingModule = mock(BillingModule.class);
        incomeService = mock(IncomeService.class);
        ExpenseBudgetRaiseRepository raises = mock(ExpenseBudgetRaiseRepository.class);
        received(0);
        service = new ExpenseBudgetService(
                settingsRepository,
                raises,
                versionRepository,
                new BudgetInForce(versionRepository, raises, incomeService, billingModule),
                mock(ExpenseService.class),
                mock(FinanceAccessPolicy.class),
                mock(ApplicationEventPublisher.class));
    }

    private ExpenseBudgetVersion savedVersion() {
        ArgumentCaptor<ExpenseBudgetVersion> captor = ArgumentCaptor.forClass(ExpenseBudgetVersion.class);
        verify(versionRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("an edit made while looking at a past month takes effect from this month")
    void pastMonthEditStartsThisMonth() {
        service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH.minusMonths(3), new SetDefaultBudgetRequest(8_000_000));

        ExpenseBudgetVersion version = savedVersion();
        assertThat(version.getEffectiveMonth()).isEqualTo(THIS_MONTH);
        assertThat(version.getAmountPaise()).isEqualTo(8_000_000);
    }

    @Test
    @DisplayName("setting a future month's budget early starts it from that month")
    void futureMonthEditStartsThatMonth() {
        LocalDate nextMonth = THIS_MONTH.plusMonths(1);

        service.setDefaultBudget(OWNER, PROPERTY, nextMonth.plusDays(9), new SetDefaultBudgetRequest(6_000_000));

        assertThat(savedVersion().getEffectiveMonth()).isEqualTo(nextMonth);
    }

    @Test
    @DisplayName("a second edit in the same month replaces that month's figure instead of stacking")
    void sameMonthEditReplaces() {
        ExpenseBudgetVersion existing = ExpenseBudgetVersion.create(PROPERTY, THIS_MONTH, 5_000_000, OWNER);
        when(versionRepository.findByPropertyIdAndEffectiveMonth(PROPERTY, THIS_MONTH)).thenReturn(Optional.of(existing));

        service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH, new SetDefaultBudgetRequest(7_000_000));

        assertThat(existing.getAmountPaise()).isEqualTo(7_000_000);
        verify(versionRepository, never()).save(any());
    }

    @Test
    @DisplayName("a month reports the budget in force then, not today's")
    void overviewReadsTheMonthsOwnBudget() {
        LocalDate pastMonth = THIS_MONTH.minusMonths(2);
        inForce(pastMonth, ExpenseBudgetVersion.create(PROPERTY, pastMonth, 5_000_000, OWNER));
        inForce(THIS_MONTH, ExpenseBudgetVersion.create(PROPERTY, THIS_MONTH, 8_000_000, OWNER));

        ExpenseBudgetOverviewResponse past = service.getOverview(OWNER, PROPERTY, pastMonth);
        ExpenseBudgetOverviewResponse current = service.getOverview(OWNER, PROPERTY, THIS_MONTH);

        assertThat(past.defaultMonthlyBudgetPaise()).isEqualTo(5_000_000L);
        assertThat(current.defaultMonthlyBudgetPaise()).isEqualTo(8_000_000L);
    }

    @Test
    @DisplayName("a month before any budget was set has none")
    void monthBeforeFirstBudgetHasNone() {
        ExpenseBudgetOverviewResponse overview = service.getOverview(OWNER, PROPERTY, THIS_MONTH.minusMonths(6));

        assertThat(overview.defaultMonthlyBudgetPaise()).isNull();
        assertThat(overview.effectiveBudgetPaise()).isNull();
    }

    // ---- This month's income in the budget (user, 2026-10-18) ------------------

    @Test
    @DisplayName("full income adds everything received that month to the fixed amount")
    void fullIncomeAddsAllReceived() {
        ExpenseBudgetVersion version = ExpenseBudgetVersion.create(PROPERTY, THIS_MONTH, 6_500_000, OWNER);
        version.changeIncomeShare(BudgetIncomeMode.FULL, null);
        inForce(THIS_MONTH, version);
        received(4_170_000);

        ExpenseBudgetOverviewResponse overview = service.getOverview(OWNER, PROPERTY, THIS_MONTH);

        assertThat(overview.defaultMonthlyBudgetPaise()).isEqualTo(6_500_000L);
        assertThat(overview.incomeReceivedPaise()).isEqualTo(4_170_000L);
        assertThat(overview.fromIncomePaise()).isEqualTo(4_170_000L);
        assertThat(overview.effectiveBudgetPaise()).isEqualTo(10_670_000L);
    }

    @Test
    @DisplayName("a part of income adds the amount set, never more than was received")
    void partOfIncomeIsCappedAtWhatWasReceived() {
        ExpenseBudgetVersion version = ExpenseBudgetVersion.create(PROPERTY, THIS_MONTH, 6_500_000, OWNER);
        version.changeIncomeShare(BudgetIncomeMode.PART, 2_000_000L);
        inForce(THIS_MONTH, version);

        received(1_500_000);
        assertThat(service.getOverview(OWNER, PROPERTY, THIS_MONTH).effectiveBudgetPaise()).isEqualTo(8_000_000L);
        received(5_000_000);
        ExpenseBudgetOverviewResponse more = service.getOverview(OWNER, PROPERTY, THIS_MONTH);
        assertThat(more.fromIncomePaise()).isEqualTo(2_000_000L);
        assertThat(more.effectiveBudgetPaise()).isEqualTo(8_500_000L);
    }

    @Test
    @DisplayName("the income share is saved with the fixed amount, and a save that says nothing about it keeps it")
    void incomeShareIsSavedAndKept() {
        received(2_000_000);
        service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH,
                new SetDefaultBudgetRequest(6_500_000, BudgetIncomeMode.PART, 2_000_000L));
        ExpenseBudgetVersion saved = savedVersion();
        assertThat(saved.getIncomeMode()).isEqualTo(BudgetIncomeMode.PART);
        assertThat(saved.getIncomePartPaise()).isEqualTo(2_000_000L);

        // Next month, from an older screen that only knows the fixed amount.
        LocalDate nextMonth = THIS_MONTH.plusMonths(1);
        when(versionRepository.findFirstByPropertyIdAndEffectiveMonthLessThanEqualOrderByEffectiveMonthDesc(PROPERTY, nextMonth))
                .thenReturn(Optional.of(saved));
        service.setDefaultBudget(OWNER, PROPERTY, nextMonth, new SetDefaultBudgetRequest(7_000_000));
        ArgumentCaptor<ExpenseBudgetVersion> captor = ArgumentCaptor.forClass(ExpenseBudgetVersion.class);
        verify(versionRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues().get(1).getIncomeMode()).isEqualTo(BudgetIncomeMode.PART);
        assertThat(captor.getAllValues().get(1).getIncomePartPaise()).isEqualTo(2_000_000L);
    }

    @Test
    @DisplayName("a part needs its amount, and only a part keeps one")
    void partNeedsItsAmount() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH,
                        new SetDefaultBudgetRequest(6_500_000, BudgetIncomeMode.PART, null)))
                .isInstanceOf(com.khatiyan.c_shared.exception.ValidationException.class);
        ExpenseBudgetVersion version = ExpenseBudgetVersion.create(PROPERTY, THIS_MONTH, 6_500_000, OWNER);
        version.changeIncomeShare(BudgetIncomeMode.PART, 2_000_000L);
        version.changeIncomeShare(BudgetIncomeMode.FULL, 2_000_000L);
        assertThat(version.getIncomePartPaise()).isNull();
    }

    @Test
    @DisplayName("a part above the income received this month is refused")
    void partAboveTheIncomeReceivedIsRefused() {
        received(1_500_000);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH,
                        new SetDefaultBudgetRequest(6_500_000, BudgetIncomeMode.PART, 2_000_000L)))
                .isInstanceOf(com.khatiyan.c_shared.exception.ValidationException.class)
                .hasMessageContaining("15,000");
        verify(versionRepository, never()).save(any());

        service.setDefaultBudget(OWNER, PROPERTY, THIS_MONTH, new SetDefaultBudgetRequest(6_500_000, BudgetIncomeMode.PART, 1_500_000L));
        assertThat(savedVersion().getIncomePartPaise()).isEqualTo(1_500_000L);
    }

    private void inForce(LocalDate month, ExpenseBudgetVersion version) {
        when(versionRepository.findFirstByPropertyIdAndEffectiveMonthLessThanEqualOrderByEffectiveMonthDesc(PROPERTY, month))
                .thenReturn(Optional.of(version));
    }

    /** Money received this month: all of it collected on bills, none manual. */
    private void received(long paise) {
        when(billingModule.getPropertyMonthSummaryForDashboard(eq(PROPERTY), any())).thenReturn(new BillingMonthSummary(
                YearMonth.from(THIS_MONTH).toString(), true, 0, 0, 0, 0, 0, paise, paise, 0, 0, 0, 0, paise, 0, 0));
        when(incomeService.monthlyTotalPaise(eq(PROPERTY), any())).thenReturn(0L);
    }
}
