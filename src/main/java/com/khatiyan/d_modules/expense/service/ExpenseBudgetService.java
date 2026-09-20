package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.expense.api.dto.BudgetAlertCandidate;
import com.khatiyan.d_modules.expense.api.dto.BudgetAlertThreshold;
import com.khatiyan.d_modules.expense.api.dto.BudgetRaiseItem;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetTrendPoint;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetTrendResponse;
import com.khatiyan.d_modules.expense.api.dto.RaiseBudgetRequest;
import com.khatiyan.d_modules.expense.api.dto.SetDefaultBudgetRequest;
import com.khatiyan.d_modules.expense.event.BudgetDefaultUpdatedEvent;
import com.khatiyan.d_modules.expense.event.BudgetRaisedEvent;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetRaise;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetSettings;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetVersion;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetRaiseRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetSettingsRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetVersionRepository;

/**
 * Budget model: a recurring per-property default plus separately-tracked monthly
 * raises. Effective budget = default + sum(raises for the month). Savings is the
 * positive remainder against month-to-date spend (which includes projected
 * salary, via {@link ExpenseService#monthlyTotalPaise}).
 *
 * <p>The default is dated. Each edit is a version effective from a month, and a
 * month reads the latest version on or before it — so changing the budget
 * changes it from now on, and a past month still reports against the budget it
 * actually ran on. {@link ExpenseBudgetSettings} remains the property's current
 * figure and the marker that a budget exists at all.
 */
@Service
public class ExpenseBudgetService {

    /** Fire the "approaching" alert once spend reaches this percent of budget. */
    private static final long APPROACHING_PERCENT = 80L;

    private final ExpenseBudgetSettingsRepository settingsRepository;
    private final ExpenseBudgetRaiseRepository raiseRepository;
    private final ExpenseBudgetVersionRepository versionRepository;
    private final ExpenseService expenseService;
    private final FinanceAccessPolicy financeAccessPolicy;
    private final ApplicationEventPublisher eventPublisher;

    public ExpenseBudgetService(
            ExpenseBudgetSettingsRepository settingsRepository,
            ExpenseBudgetRaiseRepository raiseRepository,
            ExpenseBudgetVersionRepository versionRepository,
            ExpenseService expenseService,
            FinanceAccessPolicy financeAccessPolicy,
            ApplicationEventPublisher eventPublisher) {
        this.settingsRepository = settingsRepository;
        this.raiseRepository = raiseRepository;
        this.versionRepository = versionRepository;
        this.expenseService = expenseService;
        this.financeAccessPolicy = financeAccessPolicy;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public ExpenseBudgetOverviewResponse getOverview(UUID actorUserId, UUID propertyId, LocalDate month) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        return buildOverview(propertyId, monthStart(month));
    }

    /**
     * Un-authorized budget snapshot for internal callers (the dashboard facade),
     * which have already checked property access. Never expose this over the API.
     */
    @Transactional(readOnly = true)
    public ExpenseBudgetOverviewResponse getInternalOverview(UUID propertyId, LocalDate month) {
        return buildOverview(propertyId, monthStart(month));
    }

    /**
     * Sets or edits the recurring default monthly budget, from the current month on.
     *
     * <p>Takes effect from this month (India time), or from {@code month} when
     * that is later — an owner setting next month's budget early. Never from an
     * earlier month: a month that is over ran on the budget it had, and its
     * spend and savings must keep being measured against that.
     */
    @Transactional
    public ExpenseBudgetOverviewResponse setDefaultBudget(
            UUID actorUserId, UUID propertyId, LocalDate month, SetDefaultBudgetRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        Long previousDefault = settingsRepository.findByPropertyId(propertyId)
                .map(ExpenseBudgetSettings::getDefaultMonthlyBudgetPaise)
                .orElse(null);
        settingsRepository.findByPropertyId(propertyId)
                .map(existing -> {
                    existing.updateDefault(request.amountPaise(), actorUserId);
                    return existing;
                })
                .orElseGet(() -> settingsRepository.save(
                        ExpenseBudgetSettings.create(propertyId, request.amountPaise(), actorUserId)));

        LocalDate thisMonth = YearMonth.now(INDIA).atDay(1);
        LocalDate requested = monthStart(month);
        LocalDate effectiveFrom = requested.isAfter(thisMonth) ? requested : thisMonth;
        versionRepository.findByPropertyIdAndEffectiveMonth(propertyId, effectiveFrom)
                .ifPresentOrElse(
                        version -> version.changeAmount(request.amountPaise(), actorUserId),
                        () -> versionRepository.save(ExpenseBudgetVersion.create(
                                propertyId, effectiveFrom, request.amountPaise(), actorUserId)));
        eventPublisher.publishEvent(new BudgetDefaultUpdatedEvent(
                propertyId, previousDefault, request.amountPaise(), actorUserId));
        return buildOverview(propertyId, monthStart(month));
    }

    /** Records a one-off raise for a month — tracked separately from the default. */
    @Transactional
    public ExpenseBudgetOverviewResponse raiseBudget(UUID actorUserId, UUID propertyId, RaiseBudgetRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        LocalDate month = monthStart(request.month());
        raiseRepository.save(ExpenseBudgetRaise.create(
                propertyId, month, request.amountPaise(), request.reason(), actorUserId));
        ExpenseBudgetOverviewResponse overview = buildOverview(propertyId, month);
        eventPublisher.publishEvent(new BudgetRaisedEvent(
                propertyId,
                month,
                request.amountPaise(),
                overview.effectiveBudgetPaise() == null ? request.amountPaise() : overview.effectiveBudgetPaise(),
                request.reason(),
                actorUserId));
        return overview;
    }

    /**
     * Trailing-window budget trend ending at {@code month} (default 6 months,
     * capped at 12). Savings is signed so the chart can dip below zero when a
     * month overspends; months with no budget report null effective + 0 savings.
     */
    @Transactional(readOnly = true)
    public ExpenseBudgetTrendResponse getTrend(UUID actorUserId, UUID propertyId, LocalDate month, int months) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        int window = months < 1 ? 6 : Math.min(months, 12);
        YearMonth end = YearMonth.from(month);
        List<ExpenseBudgetTrendPoint> points = new ArrayList<>();
        for (int offset = window - 1; offset >= 0; offset--) {
            YearMonth yearMonth = end.minusMonths(offset);
            LocalDate start = yearMonth.atDay(1);
            // Per month: each point is measured against the budget in force then.
            Long defaultBudget = versionRepository.defaultFor(propertyId, start).orElse(null);
            long raised = raiseRepository.sumForMonth(propertyId, start);
            Long effective = (defaultBudget == null && raised == 0)
                    ? null
                    : (defaultBudget == null ? 0L : defaultBudget) + raised;
            long spent = expenseService.monthlyTotalPaise(propertyId, yearMonth);
            long savings = effective == null ? 0L : effective - spent;
            points.add(new ExpenseBudgetTrendPoint(start, spent, effective, savings, raised));
        }
        return new ExpenseBudgetTrendResponse(points);
    }

    /** Properties whose month-to-date spend has crossed a budget alert threshold. */
    @Transactional(readOnly = true)
    public List<BudgetAlertCandidate> listBudgetAlertCandidates(LocalDate today) {
        LocalDate month = monthStart(today);
        YearMonth yearMonth = YearMonth.from(today);
        List<BudgetAlertCandidate> candidates = new ArrayList<>();
        for (ExpenseBudgetSettings settings : settingsRepository.findAll()) {
            long effective = versionRepository.defaultFor(settings.getPropertyId(), month).orElse(0L)
                    + raiseRepository.sumForMonth(settings.getPropertyId(), month);
            if (effective <= 0) {
                continue;
            }
            long spent = expenseService.monthlyTotalPaise(settings.getPropertyId(), yearMonth);
            if (spent >= effective) {
                candidates.add(new BudgetAlertCandidate(
                        settings.getPropertyId(), BudgetAlertThreshold.EXCEEDED, spent, effective, month));
            } else if (spent * 100 >= effective * APPROACHING_PERCENT) {
                candidates.add(new BudgetAlertCandidate(
                        settings.getPropertyId(), BudgetAlertThreshold.APPROACHING, spent, effective, month));
            }
        }
        return candidates;
    }

    private ExpenseBudgetOverviewResponse buildOverview(UUID propertyId, LocalDate month) {
        Long defaultBudget = versionRepository.defaultFor(propertyId, month).orElse(null);
        long raised = raiseRepository.sumForMonth(propertyId, month);
        Long effective = (defaultBudget == null && raised == 0)
                ? null
                : (defaultBudget == null ? 0L : defaultBudget) + raised;
        long spent = expenseService.monthlyTotalPaise(propertyId, YearMonth.from(month));
        Long remaining = effective == null ? null : effective - spent;
        long savings = (remaining != null && remaining > 0) ? remaining : 0L;
        List<BudgetRaiseItem> raises = raiseRepository
                .findByPropertyIdAndBudgetMonthOrderByCreatedAtDesc(propertyId, month).stream()
                .map(raise -> new BudgetRaiseItem(raise.getId(), raise.getAmountPaise(), raise.getReason(), raise.getCreatedAt()))
                .toList();
        return new ExpenseBudgetOverviewResponse(
                month, defaultBudget, raised, effective, spent, remaining, savings, raises);
    }

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private static LocalDate monthStart(LocalDate month) {
        return YearMonth.from(month).atDay(1);
    }
}
