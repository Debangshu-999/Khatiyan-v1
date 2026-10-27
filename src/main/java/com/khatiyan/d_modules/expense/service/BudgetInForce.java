package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.expense.model.BudgetIncomeMode;
import com.khatiyan.d_modules.expense.model.ExpenseBudgetVersion;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetRaiseRepository;
import com.khatiyan.d_modules.expense.repository.ExpenseBudgetVersionRepository;

/**
 * A month's budget, worked out one way for every reader (2026-10-18): the
 * fixed amount in force that month, plus that month's income share, plus the
 * month's one-off raises. The budget screen, the month summary, the trend,
 * the budget alerts and the Finance dashboard all read it here, so they can
 * never disagree.
 *
 * <p>Income here is money received that month (user's choice): bills
 * collected plus manual income, the P&L's "Collected". So a budget that takes
 * income grows as rent comes in.
 */
@Component
public class BudgetInForce {

    /**
     * @param fixedPaise          the fixed amount in force, null when never set
     * @param incomeReceivedPaise money received that month. Null when it was not read: the
     *                            budget takes no income and the caller did not ask for it
     * @param fromIncomePaise     what the income share adds this month
     * @param effectivePaise      fixed + from income + raised, null when no budget is set at all
     */
    public record Month(
            Long fixedPaise,
            BudgetIncomeMode incomeMode,
            Long incomePartPaise,
            Long incomeReceivedPaise,
            long fromIncomePaise,
            long raisedPaise,
            Long effectivePaise) {
    }

    private final ExpenseBudgetVersionRepository versions;
    private final ExpenseBudgetRaiseRepository raises;
    private final IncomeService incomeService;
    private final BillingModule billingModule;

    public BudgetInForce(ExpenseBudgetVersionRepository versions, ExpenseBudgetRaiseRepository raises,
            IncomeService incomeService, BillingModule billingModule) {
        this.versions = versions;
        this.raises = raises;
        this.incomeService = incomeService;
        this.billingModule = billingModule;
    }

    /** The month's budget. Income is read only when the budget takes some. */
    public Month of(UUID propertyId, LocalDate month) {
        return of(propertyId, month, false);
    }

    /** The month's budget, with the income received read either way, for the screen that shows it. */
    public Month withIncome(UUID propertyId, LocalDate month) {
        return of(propertyId, month, true);
    }

    private Month of(UUID propertyId, LocalDate month, boolean alwaysReadIncome) {
        LocalDate start = month.withDayOfMonth(1);
        ExpenseBudgetVersion version = versions
                .findFirstByPropertyIdAndEffectiveMonthLessThanEqualOrderByEffectiveMonthDesc(propertyId, start)
                .orElse(null);
        long raised = raises.sumForMonth(propertyId, start);
        boolean takesIncome = version != null && version.getIncomeMode() != BudgetIncomeMode.NONE;
        Long received = takesIncome || alwaysReadIncome ? incomeReceivedPaise(propertyId, YearMonth.from(start)) : null;
        if (version == null) {
            return new Month(null, BudgetIncomeMode.NONE, null, received, 0, raised, raised == 0 ? null : raised);
        }
        long fromIncome = takesIncome ? version.fromIncome(received) : 0;
        return new Month(version.getAmountPaise(), version.getIncomeMode(), version.getIncomePartPaise(), received,
                fromIncome, raised, version.getAmountPaise() + fromIncome + raised);
    }

    /** Bills collected plus manual income, for one month: what the P&L calls Collected. */
    public long incomeReceivedPaise(UUID propertyId, YearMonth month) {
        return billingModule.getPropertyMonthSummaryForDashboard(propertyId, month.toString()).collectedPaise()
                + incomeService.monthlyTotalPaise(propertyId, month);
    }
}
