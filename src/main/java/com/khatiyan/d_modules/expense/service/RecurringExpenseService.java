package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.expense.api.dto.CreateRecurringExpenseRequest;
import com.khatiyan.d_modules.expense.api.dto.RecurringExpenseResponse;
import com.khatiyan.d_modules.expense.api.dto.UpdateRecurringExpenseRequest;
import com.khatiyan.d_modules.expense.model.Expense;
import com.khatiyan.d_modules.expense.model.ExpenseCategory;
import com.khatiyan.d_modules.expense.model.RecurringExpense;
import com.khatiyan.d_modules.expense.repository.ExpenseCategoryRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseRepository;
import com.khatiyan.d_modules.expense.repository.RecurringExpenseRepository;
import com.khatiyan.d_modules.staff.StaffModule;

/** Monthly recurring expense templates (materialised by the scheduler). */
@Service
public class RecurringExpenseService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final RecurringExpenseRepository recurringRepository;
    private final ExpenseCategoryRepository categoryRepository;
    private final ExpenseRepository expenseRepository;
    private final FinanceAccessPolicy financeAccessPolicy;
    private final StaffModule staffModule;

    public RecurringExpenseService(
            RecurringExpenseRepository recurringRepository,
            ExpenseCategoryRepository categoryRepository,
            ExpenseRepository expenseRepository,
            FinanceAccessPolicy financeAccessPolicy,
            StaffModule staffModule) {
        this.recurringRepository = recurringRepository;
        this.categoryRepository = categoryRepository;
        this.expenseRepository = expenseRepository;
        this.financeAccessPolicy = financeAccessPolicy;
        this.staffModule = staffModule;
    }

    @Transactional(readOnly = true)
    public List<RecurringExpenseResponse> list(UUID actorUserId, UUID propertyId) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        Map<UUID, String> names = categoryNames(propertyId);
        List<RecurringExpenseResponse> items = new ArrayList<>();
        // Projected staff salary IS a recurring expense — it's just derived from
        // current staff instead of stored as a template, so it surfaces here as a
        // read-only system row (no edit / deactivate; not materialised by the
        // scheduler — the expense totals already include it directly).
        long projectedSalary = staffModule.estimatedMonthlySalaryPaise(
                propertyId, YearMonth.now(IST).atDay(1));
        if (projectedSalary > 0) {
            items.add(new RecurringExpenseResponse(
                    propertyId, null, "Salary", "Staff payroll", projectedSalary,
                    "Projected from current staff salaries", 1, true, null, true));
        }
        recurringRepository.findByPropertyIdOrderByCreatedAtDesc(propertyId).stream()
                .map(recurring -> RecurringExpenseResponse.from(
                        recurring, names.getOrDefault(recurring.getCategoryId(), "Unknown")))
                .forEach(items::add);
        return items;
    }

    @Transactional
    public RecurringExpenseResponse create(UUID actorUserId, UUID propertyId, CreateRecurringExpenseRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        ExpenseCategory category = activeCategory(propertyId, request.categoryId());
        RecurringExpense recurring = recurringRepository.save(RecurringExpense.create(
                propertyId, category.getId(), request.paidTo(), request.amountPaise(),
                request.description(), request.dayOfMonth(), actorUserId));
        return RecurringExpenseResponse.from(recurring, category.getName());
    }

    @Transactional
    public RecurringExpenseResponse update(
            UUID actorUserId, UUID propertyId, UUID id, UpdateRecurringExpenseRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        RecurringExpense recurring = recurring(propertyId, id);
        ExpenseCategory category = activeCategory(propertyId, request.categoryId());
        recurring.update(category.getId(), request.paidTo(), request.amountPaise(),
                request.description(), request.dayOfMonth());
        return RecurringExpenseResponse.from(recurring, category.getName());
    }

    @Transactional
    public void deactivate(UUID actorUserId, UUID propertyId, UUID id) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        recurring(propertyId, id).deactivate();
    }

    /**
     * Materialises an expense for each active template not yet generated for
     * {@code today}'s month. Idempotent via {@code lastGeneratedMonth}, so the
     * daily scheduler can run (and re-run / catch up) safely. Returns the count.
     */
    @Transactional
    public int generateDueRecurringExpenses(LocalDate today) {
        YearMonth month = YearMonth.from(today);
        int generated = 0;
        for (RecurringExpense recurring : recurringRepository.findByActiveTrue()) {
            if (!recurring.shouldGenerateFor(today)) {
                continue;
            }
            ExpenseCategory category = categoryRepository.findById(recurring.getCategoryId()).orElse(null);
            if (category == null || !category.isActive()) {
                continue; // leave un-marked so it generates once the category is restored
            }
            expenseRepository.save(Expense.fromRecurring(
                    recurring.getPropertyId(),
                    category.getId(),
                    recurring.getPaidTo(),
                    recurring.getAmountPaise(),
                    month.atDay(recurring.getDayOfMonth()),
                    recurring.getDescription(),
                    recurring.getId(),
                    recurring.getCreatedByUserId()));
            recurring.markGeneratedFor(today);
            generated++;
        }
        return generated;
    }

    private RecurringExpense recurring(UUID propertyId, UUID id) {
        return recurringRepository.findByIdAndPropertyId(id, propertyId)
                .orElseThrow(() -> new NotFoundException("RecurringExpense", id));
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
}
