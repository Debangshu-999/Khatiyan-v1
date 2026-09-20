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
    private ExpenseBudgetService service;

    @BeforeEach
    void setUp() {
        settingsRepository = mock(ExpenseBudgetSettingsRepository.class);
        versionRepository = mock(ExpenseBudgetVersionRepository.class);
        service = new ExpenseBudgetService(
                settingsRepository,
                mock(ExpenseBudgetRaiseRepository.class),
                versionRepository,
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
        when(versionRepository.defaultFor(PROPERTY, pastMonth)).thenReturn(Optional.of(5_000_000L));
        when(versionRepository.defaultFor(eq(PROPERTY), eq(THIS_MONTH))).thenReturn(Optional.of(8_000_000L));

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
}
