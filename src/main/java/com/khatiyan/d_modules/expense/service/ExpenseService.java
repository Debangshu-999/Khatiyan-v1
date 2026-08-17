package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.expense.api.dto.CreateExpenseRequest;
import com.khatiyan.d_modules.expense.api.dto.ExpenseCategoryTotal;
import com.khatiyan.d_modules.expense.api.dto.ExpenseMonthSummaryResponse;
import com.khatiyan.d_modules.expense.api.dto.ExpenseResponse;
import com.khatiyan.d_modules.expense.api.dto.ReverseExpenseRequest;
import com.khatiyan.d_modules.expense.model.Expense;
import com.khatiyan.d_modules.expense.model.ExpenseCategory;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetSettings;
import com.khatiyan.d_modules.expense.model.ExpenseEntryType;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetRaiseRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetSettingsRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseCategoryRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseRepository;
import com.khatiyan.d_modules.staff.StaffModule;

/** Manual expense entry, corrections (reversal), paginated history and summary. */
@Service
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final ExpenseCategoryRepository categoryRepository;
    private final ExpenseBudgetSettingsRepository budgetSettingsRepository;
    private final ExpenseBudgetRaiseRepository budgetRaiseRepository;
    private final FinanceAccessPolicy financeAccessPolicy;
    private final StaffModule staffModule;

    public ExpenseService(
            ExpenseRepository expenseRepository,
            ExpenseCategoryRepository categoryRepository,
            ExpenseBudgetSettingsRepository budgetSettingsRepository,
            ExpenseBudgetRaiseRepository budgetRaiseRepository,
            FinanceAccessPolicy financeAccessPolicy,
            StaffModule staffModule) {
        this.expenseRepository = expenseRepository;
        this.categoryRepository = categoryRepository;
        this.budgetSettingsRepository = budgetSettingsRepository;
        this.budgetRaiseRepository = budgetRaiseRepository;
        this.financeAccessPolicy = financeAccessPolicy;
        this.staffModule = staffModule;
    }

    @Transactional
    public ExpenseResponse createManual(UUID actorUserId, UUID propertyId, CreateExpenseRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        ExpenseCategory category = activeCategory(propertyId, request.categoryId());
        Expense expense = expenseRepository.save(Expense.manual(
                propertyId, category.getId(), request.paidTo(), request.amountPaise(),
                request.incurredDate(), request.description(), actorUserId));
        return ExpenseResponse.from(expense, category.getName(), false);
    }

    @Transactional
    public ExpenseResponse reverse(UUID actorUserId, UUID propertyId, UUID expenseId, ReverseExpenseRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        Expense original = expenseRepository.findByIdAndPropertyId(expenseId, propertyId)
                .orElseThrow(() -> new NotFoundException("Expense", expenseId));
        if (original.getEntryType() == ExpenseEntryType.REVERSAL) {
            throw new ValidationException("A reversal cannot be reversed");
        }
        if (original.getEntryType() == ExpenseEntryType.AUTO) {
            throw new ValidationException("Automatic entries are corrected at their source");
        }
        if (expenseRepository.existsByReversesExpenseId(original.getId())) {
            throw new ValidationException("This expense has already been reversed");
        }
        Expense reversal = expenseRepository.save(
                Expense.reversalOf(original, request.reason(), actorUserId, LocalDate.now()));
        return ExpenseResponse.from(reversal, categoryName(propertyId, reversal.getCategoryId()), false);
    }

    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> listExpenses(
            UUID actorUserId, UUID propertyId, LocalDate month, int page, int size) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        YearMonth yearMonth = YearMonth.from(month);
        List<Expense> expenses = expenseRepository.findForPeriod(
                propertyId, yearMonth.atDay(1), yearMonth.plusMonths(1).atDay(1));
        Map<UUID, String> names = categoryNames(propertyId);
        Set<UUID> reversedIds = expenses.stream()
                .map(Expense::getReversesExpenseId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        List<ExpenseResponse> items = expenses.stream()
                .map(expense -> ExpenseResponse.from(
                        expense,
                        names.getOrDefault(expense.getCategoryId(), "Unknown"),
                        reversedIds.contains(expense.getId())))
                .toList();
        return PageResponse.of(items, page, size);
    }

    @Transactional(readOnly = true)
    public ExpenseMonthSummaryResponse monthlySummary(UUID actorUserId, UUID propertyId, LocalDate month) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        YearMonth yearMonth = YearMonth.from(month);
        LocalDate start = yearMonth.atDay(1);
        List<Expense> expenses = expenseRepository.findForPeriod(
                propertyId, start, yearMonth.plusMonths(1).atDay(1));
        Map<UUID, String> names = categoryNames(propertyId);

        Map<UUID, Long> totalsByCategory = new LinkedHashMap<>();
        for (Expense expense : expenses) {
            totalsByCategory.merge(expense.getCategoryId(), expense.getAmountPaise(), Long::sum);
        }
        List<ExpenseCategoryTotal> byCategory = new ArrayList<>(totalsByCategory.entrySet().stream()
                .filter(entry -> entry.getValue() != 0)
                .map(entry -> new ExpenseCategoryTotal(
                        entry.getKey(), names.getOrDefault(entry.getKey(), "Unknown"), entry.getValue()))
                .toList());

        // Salary is a derived (projected) expense — the same "Est payout" figure —
        // not a stored ledger row, so add it to the total and as its own line.
        long projectedSalary = projectedSalaryPaise(propertyId, start);
        if (projectedSalary > 0) {
            byCategory.add(new ExpenseCategoryTotal(null, "Salary (estimated)", projectedSalary));
        }
        byCategory.sort(Comparator.comparingLong(ExpenseCategoryTotal::amountPaise).reversed());

        long total = expenses.stream().mapToLong(Expense::getAmountPaise).sum() + projectedSalary;
        Long defaultBudget = budgetSettingsRepository.findByPropertyId(propertyId)
                .map(ExpenseBudgetSettings::getDefaultMonthlyBudgetPaise)
                .orElse(null);
        long raised = budgetRaiseRepository.sumForMonth(propertyId, start);
        Long budget = (defaultBudget == null && raised == 0)
                ? null
                : (defaultBudget == null ? 0L : defaultBudget) + raised;
        return new ExpenseMonthSummaryResponse(start, total, budget, byCategory);
    }

    /** Net expense total for a month — internal read for P&L / budget alerts. */
    @Transactional(readOnly = true)
    public long monthlyTotalPaise(UUID propertyId, YearMonth month) {
        long ledger = expenseRepository.sumNetForPeriod(propertyId, month.atDay(1), month.plusMonths(1).atDay(1));
        return ledger + projectedSalaryPaise(propertyId, month.atDay(1));
    }

    // Projected salary is a forward estimate from current staff, so it only counts
    // for the current and future months. Back-projecting it onto past months would
    // make every month's total look identical (it doesn't vary by month).
    private long projectedSalaryPaise(UUID propertyId, LocalDate monthStart) {
        if (YearMonth.from(monthStart).isBefore(YearMonth.now(ZoneId.of("Asia/Kolkata")))) {
            return 0L;
        }
        return staffModule.estimatedMonthlySalaryPaise(propertyId, monthStart);
    }

    private ExpenseCategory activeCategory(UUID propertyId, UUID categoryId) {
        ExpenseCategory category = categoryRepository.findByIdAndPropertyId(categoryId, propertyId)
                .orElseThrow(() -> new NotFoundException("ExpenseCategory", categoryId));
        if (!category.isActive()) {
            throw new ValidationException("Cannot use an inactive category");
        }
        return category;
    }

    private Map<UUID, String> categoryNames(UUID propertyId) {
        Map<UUID, String> names = new HashMap<>();
        for (ExpenseCategory category : categoryRepository.findByPropertyId(propertyId)) {
            names.put(category.getId(), category.getName());
        }
        return names;
    }

    private String categoryName(UUID propertyId, UUID categoryId) {
        return categoryNames(propertyId).getOrDefault(categoryId, "Unknown");
    }
}
