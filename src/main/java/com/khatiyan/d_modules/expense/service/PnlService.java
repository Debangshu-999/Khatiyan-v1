package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.expense.api.dto.ExpenseMonthSummaryResponse;
import com.khatiyan.d_modules.expense.api.dto.PnlLine;
import com.khatiyan.d_modules.expense.api.dto.PnlStatementResponse;
import com.khatiyan.d_modules.expense.api.dto.PnlTrendPoint;
import com.khatiyan.d_modules.expense.api.dto.PnlTrendResponse;

/**
 * Property profit-and-loss: income (billing accrual + manual ledger) minus
 * expense (expense module, incl. projected salary). Read-only aggregation over
 * the billing facade, the manual-income ledger and the expense summary.
 */
@Service
public class PnlService {

    private static final int MAX_TREND_MONTHS = 24;

    private final BillingModule billingModule;
    private final IncomeService incomeService;
    private final ExpenseService expenseService;
    private final FinanceAccessPolicy financeAccessPolicy;

    public PnlService(
            BillingModule billingModule,
            IncomeService incomeService,
            ExpenseService expenseService,
            FinanceAccessPolicy financeAccessPolicy) {
        this.billingModule = billingModule;
        this.incomeService = incomeService;
        this.expenseService = expenseService;
        this.financeAccessPolicy = financeAccessPolicy;
    }

    @Transactional(readOnly = true)
    public PnlStatementResponse statement(UUID actorUserId, UUID propertyId, LocalDate month) {
        financeAccessPolicy.ensureCanUsePnl(actorUserId, propertyId);
        YearMonth yearMonth = YearMonth.from(month);
        LocalDate monthStart = yearMonth.atDay(1);

        // Income from billing, split by category. For the current month the rent
        // figure includes cycles not yet generated, so this is the month's
        // finances rather than a snapshot of what the scheduler has run — and the
        // rent / other-bill lines still sum to the billed total.
        BillingMonthSummary billing = billingModule.getPropertyMonthSummaryForDashboard(
                propertyId, yearMonth.toString());
        int rentCount = billing.rentCycleCount();
        long rentPaise = billing.rentBilledPaise();
        int oneOffCount = billing.oneOffCount();
        long oneOffPaise = billing.oneOffBilledPaise();
        long billBilled = rentPaise + oneOffPaise;
        long billCollected = billing.collectedPaise();
        long billUncollected = Math.max(0, billBilled - billCollected);

        // Income from the manual ledger (owner-entered, not through billing).
        long manualIncome = incomeService.monthlyTotalPaise(propertyId, yearMonth);
        List<PnlLine> manualBreakdown = incomeService.monthlyBreakdown(propertyId, yearMonth);

        long totalIncome = billBilled + manualIncome;
        long totalRealized = billCollected + manualIncome;

        // Expense from the expense module (ledger + projected salary) with breakdown.
        ExpenseMonthSummaryResponse expense = expenseService.monthlySummary(actorUserId, propertyId, monthStart);
        long expenseTotal = expense.totalSpentPaise();
        List<PnlLine> expenseBreakdown = expense.byCategory().stream()
                .map(c -> new PnlLine(c.categoryName(), c.amountPaise()))
                .toList();

        boolean hasData = billing.hasData() || manualIncome != 0 || expenseTotal != 0;

        return new PnlStatementResponse(
                monthStart,
                hasData,
                rentCount,
                rentPaise,
                oneOffCount,
                oneOffPaise,
                billBilled,
                billCollected,
                billUncollected,
                manualIncome,
                manualBreakdown,
                totalIncome,
                totalRealized,
                expenseTotal,
                expenseBreakdown,
                totalIncome - expenseTotal,
                totalRealized - expenseTotal);
    }

    /**
     * Renders the monthly statement as a downloadable CSV summary report — the
     * P&L analogue of the billing monthly report, generated on demand so any
     * month (including the current one) can be viewed and downloaded.
     */
    @Transactional(readOnly = true)
    public String exportStatementCsv(UUID actorUserId, UUID propertyId, LocalDate month) {
        PnlStatementResponse s = statement(actorUserId, propertyId, month);
        YearMonth yearMonth = YearMonth.from(s.month());

        StringBuilder csv = new StringBuilder();
        csv.append("Khatiyan — Profit & Loss\n");
        csv.append("Month,").append(csvCell(yearMonth.toString())).append("\n\n");

        csv.append("INCOME\n");
        csv.append("Source,Count,Amount (INR)\n");
        csv.append("Rent bills,").append(s.billRentCount()).append(",").append(rupees(s.billRentPaise())).append("\n");
        csv.append("Other bills,").append(s.billOneOffCount()).append(",").append(rupees(s.billOneOffPaise())).append("\n");
        for (PnlLine line : s.manualIncomeBreakdown()) {
            csv.append(csvCell(line.label())).append(",,").append(rupees(line.amountPaise())).append("\n");
        }
        csv.append("Total income,,").append(rupees(s.totalIncomePaise())).append("\n");
        csv.append("Collected,,").append(rupees(s.billCollectedPaise() + s.manualIncomePaise())).append("\n");
        csv.append("Yet to be collected,,").append(rupees(s.billUncollectedPaise())).append("\n\n");

        csv.append("EXPENSE\n");
        csv.append("Category,Amount (INR)\n");
        for (PnlLine line : s.expenseBreakdown()) {
            csv.append(csvCell(line.label())).append(",").append(rupees(line.amountPaise())).append("\n");
        }
        csv.append("Total expense,").append(rupees(s.expensePaise())).append("\n\n");

        csv.append("NET\n");
        csv.append("Net profit/loss,,").append(rupees(s.netPaise())).append("\n");
        csv.append("Net (cash basis),,").append(rupees(s.netRealizedPaise())).append("\n");
        return csv.toString();
    }

    private static String rupees(long paise) {
        return String.format(java.util.Locale.ROOT, "%.2f", paise / 100.0);
    }

    private static String csvCell(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    @Transactional(readOnly = true)
    public PnlTrendResponse trend(UUID actorUserId, UUID propertyId, LocalDate month, int months) {
        financeAccessPolicy.ensureCanUsePnl(actorUserId, propertyId);
        int window = Math.min(Math.max(months, 1), MAX_TREND_MONTHS);
        YearMonth end = YearMonth.from(month);

        List<PnlTrendPoint> points = new ArrayList<>();
        for (int i = window - 1; i >= 0; i--) {
            YearMonth ym = end.minusMonths(i);
            BillingMonthSummary billing = billingModule.getPropertyMonthSummaryForDashboard(
                    propertyId, ym.toString());
            long income = billing.rentBilledPaise() + billing.oneOffBilledPaise()
                    + incomeService.monthlyTotalPaise(propertyId, ym);
            long expense = expenseService.monthlyTotalPaise(propertyId, ym);
            points.add(new PnlTrendPoint(ym.atDay(1), income, expense, income - expense));
        }
        return new PnlTrendResponse(points);
    }
}
