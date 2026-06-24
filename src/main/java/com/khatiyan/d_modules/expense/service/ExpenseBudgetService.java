package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.expense.api.dto.BudgetAlertCandidate;
import com.khatiyan.d_modules.expense.api.dto.BudgetAlertThreshold;
import com.khatiyan.d_modules.expense.api.dto.BudgetRaiseItem;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.api.dto.RaiseBudgetRequest;
import com.khatiyan.d_modules.expense.api.dto.SetDefaultBudgetRequest;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetRaise;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetSettings;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetRaiseRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetSettingsRepository;

/**
 * Budget model: a recurring per-property default plus separately-tracked monthly
 * raises. Effective budget = default + sum(raises for the month). Savings is the
 * positive remainder against month-to-date spend (which includes projected
 * salary, via {@link ExpenseService#monthlyTotalPaise}).
 */
@Service
public class ExpenseBudgetService {

    /** Fire the "approaching" alert once spend reaches this percent of budget. */
    private static final long APPROACHING_PERCENT = 80L;

    private final ExpenseBudgetSettingsRepository settingsRepository;
    private final ExpenseBudgetRaiseRepository raiseRepository;
    private final ExpenseService expenseService;
    private final FinanceAccessPolicy financeAccessPolicy;

    public ExpenseBudgetService(
            ExpenseBudgetSettingsRepository settingsRepository,
            ExpenseBudgetRaiseRepository raiseRepository,
            ExpenseService expenseService,
            FinanceAccessPolicy financeAccessPolicy) {
        this.settingsRepository = settingsRepository;
        this.raiseRepository = raiseRepository;
        this.expenseService = expenseService;
        this.financeAccessPolicy = financeAccessPolicy;
    }

    @Transactional(readOnly = true)
    public ExpenseBudgetOverviewResponse getOverview(UUID actorUserId, UUID propertyId, LocalDate month) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        return buildOverview(propertyId, monthStart(month));
    }

    /** Sets / edits the recurring default monthly budget (applies to every month). */
    @Transactional
    public ExpenseBudgetOverviewResponse setDefaultBudget(
            UUID actorUserId, UUID propertyId, LocalDate month, SetDefaultBudgetRequest request) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        settingsRepository.findByPropertyId(propertyId)
                .map(existing -> {
                    existing.updateDefault(request.amountPaise(), actorUserId);
                    return existing;
                })
                .orElseGet(() -> settingsRepository.save(
                        ExpenseBudgetSettings.create(propertyId, request.amountPaise(), actorUserId)));
        return buildOverview(propertyId, monthStart(month));
    }

    /** Records a one-off raise for a month — tracked separately from the default. */
    @Transactional
    public ExpenseBudgetOverviewResponse raiseBudget(UUID actorUserId, UUID propertyId, RaiseBudgetRequest request) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        LocalDate month = monthStart(request.month());
        raiseRepository.save(ExpenseBudgetRaise.create(
                propertyId, month, request.amountPaise(), request.reason(), actorUserId));
        return buildOverview(propertyId, month);
    }

    /** Properties whose month-to-date spend has crossed a budget alert threshold. */
    @Transactional(readOnly = true)
    public List<BudgetAlertCandidate> listBudgetAlertCandidates(LocalDate today) {
        LocalDate month = monthStart(today);
        YearMonth yearMonth = YearMonth.from(today);
        List<BudgetAlertCandidate> candidates = new ArrayList<>();
        for (ExpenseBudgetSettings settings : settingsRepository.findAll()) {
            long effective = settings.getDefaultMonthlyBudgetPaise()
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
        Long defaultBudget = settingsRepository.findByPropertyId(propertyId)
                .map(ExpenseBudgetSettings::getDefaultMonthlyBudgetPaise)
                .orElse(null);
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

    private static LocalDate monthStart(LocalDate month) {
        return YearMonth.from(month).atDay(1);
    }
}
