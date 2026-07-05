package com.khatiyan.d_modules.expense;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.expense.api.dto.BudgetAlertCandidate;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.service.ExpenseBudgetService;
import com.khatiyan.d_modules.expense.service.ExpenseService;

/**
 * Public facade for the expense module. Other modules (the P&L module, and the
 * reminder module's budget-alert scanner) read expense data through this instead
 * of touching expense services or repositories directly.
 */
@Component
public class ExpenseModule {

    private final ExpenseService expenseService;
    private final ExpenseBudgetService budgetService;

    public ExpenseModule(ExpenseService expenseService, ExpenseBudgetService budgetService) {
        this.expenseService = expenseService;
        this.budgetService = budgetService;
    }

    /** Net expense total (charges minus reversals) for a property in a month. */
    public long monthlyExpenseTotalPaise(UUID propertyId, YearMonth month) {
        return expenseService.monthlyTotalPaise(propertyId, month);
    }

    /**
     * Current-month budget snapshot for a property (effective budget + spend), for
     * internal callers that have already checked property access (the dashboard).
     */
    public ExpenseBudgetOverviewResponse budgetSnapshot(UUID propertyId, LocalDate month) {
        return budgetService.getInternalOverview(propertyId, month);
    }

    /** Properties whose month-to-date spend has crossed a budget alert threshold. */
    public List<BudgetAlertCandidate> listBudgetAlertCandidates(LocalDate today) {
        return budgetService.listBudgetAlertCandidates(today);
    }
}
