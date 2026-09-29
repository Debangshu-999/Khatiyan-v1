package com.khatiyan.d_modules.expense.analytics;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.service.ExpenseBudgetService;
import com.khatiyan.d_modules.expense.service.ExpenseService;
import com.khatiyan.d_modules.expense.service.IncomeService;

/**
 * The expense module's answers for owner analytics. Reads the {@code expense}
 * schema only; the monthly totals and budget reuse the services the P&L and
 * budget screens use, so the Finance cards can never disagree with them.
 *
 * <p>Reversals are stored as negative rows that copy the original's payee and
 * category, so every sum here nets them out on its own.
 */
@Component
public class ExpenseAnalytics {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /** The P&L's own name for the projected salary line; analytics sends it as a code, not this text. */
    public static final String PROJECTED_SALARY = "Salary (estimated)";

    private final NamedParameterJdbcTemplate jdbc;
    private final IncomeService incomeService;
    private final ExpenseService expenseService;
    private final ExpenseBudgetService budgetService;

    public ExpenseAnalytics(
            NamedParameterJdbcTemplate jdbc,
            IncomeService incomeService,
            ExpenseService expenseService,
            ExpenseBudgetService budgetService) {
        this.jdbc = jdbc;
        this.incomeService = incomeService;
        this.expenseService = expenseService;
        this.budgetService = budgetService;
    }

    private static MapSqlParameterSource range(UUID propertyId, LocalDate from, LocalDate to) {
        return new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to);
    }

    public record MonthTotals(long manualIncomePaise, long expensePaise) {}

    /** A month's manual income and expense, exactly as the P&L statement computes them (projected salary included). */
    public MonthTotals monthTotals(UUID propertyId, YearMonth month) {
        return new MonthTotals(incomeService.monthlyTotalPaise(propertyId, month), expenseService.monthlyTotalPaise(propertyId, month));
    }

    /** A name the owner typed, its net amount, and how many entries (reversals not counted) make it up. */
    public record NamedAmount(String name, long amountPaise, int items) {}

    /**
     * Net spend per category, by the owner's own category names, largest first.
     * When the range reaches the current month the P&L also counts that month's
     * projected salary, so this does too, under the P&L's own label.
     */
    public List<NamedAmount> spendByCategory(UUID propertyId, LocalDate from, LocalDate to) {
        List<NamedAmount> rows = new ArrayList<>(jdbc.query("""
                SELECT c.name AS name, SUM(e.amount_paise) AS amount,
                       COUNT(*) FILTER (WHERE e.entry_type <> 'REVERSAL') AS items
                FROM expense.expenses e
                JOIN expense.expense_categories c ON c.id = e.category_id
                WHERE e.property_id = :propertyId AND e.incurred_date BETWEEN :from AND :to
                GROUP BY c.id, c.name
                HAVING SUM(e.amount_paise) <> 0
                """, range(propertyId, from, to),
                (rs, i) -> new NamedAmount(rs.getString("name"), rs.getLong("amount"), rs.getInt("items"))));
        YearMonth current = YearMonth.now(IST);
        if (!YearMonth.from(from).isAfter(current) && !YearMonth.from(to).isBefore(current)) {
            long salary = expenseService.projectedSalaryPaise(propertyId, current.atDay(1));
            if (salary > 0) {
                rows.add(new NamedAmount(PROJECTED_SALARY, salary, 0));
            }
        }
        rows.sort(Comparator.comparingLong(NamedAmount::amountPaise).reversed());
        return rows;
    }

    /** Net spend per payee, grouped ignoring case and stray spaces, largest first. */
    public List<NamedAmount> payees(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT MIN(TRIM(paid_to)) AS name, SUM(amount_paise) AS amount,
                       COUNT(*) FILTER (WHERE entry_type <> 'REVERSAL') AS items
                FROM expense.expenses
                WHERE property_id = :propertyId AND incurred_date BETWEEN :from AND :to
                  AND paid_to IS NOT NULL AND TRIM(paid_to) <> ''
                GROUP BY LOWER(TRIM(paid_to))
                HAVING SUM(amount_paise) <> 0
                ORDER BY amount DESC, name
                """, range(propertyId, from, to),
                (rs, i) -> new NamedAmount(rs.getString("name"), rs.getLong("amount"), rs.getInt("items")));
    }

    /** Net manual income per source, grouped ignoring case and stray spaces, largest first. */
    public List<NamedAmount> incomeBySource(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT MIN(TRIM(source)) AS name, SUM(amount_paise) AS amount,
                       COUNT(*) FILTER (WHERE entry_type <> 'REVERSAL') AS items
                FROM expense.income_entries
                WHERE property_id = :propertyId AND received_date BETWEEN :from AND :to
                GROUP BY LOWER(TRIM(source))
                HAVING SUM(amount_paise) <> 0
                ORDER BY amount DESC, name
                """, range(propertyId, from, to),
                (rs, i) -> new NamedAmount(rs.getString("name"), rs.getLong("amount"), rs.getInt("items")));
    }

    /**
     * The fixed costs in a range (the owner's rule, 2026-09-26): recurring
     * expenses by payee, each net of its own reversals, plus the estimated
     * salary the P&L adds for the current month. Salary is the estimate, not
     * what was paid, because the estimate is what expenses track. Past months
     * carry no salary, as on the P&L (salary payments are never posted as
     * expenses, and the owner chose to leave that so).
     */
    public record FixedSpend(List<NamedAmount> recurring, long salaryEstimatedPaise) {
        public long totalPaise() {
            return recurring.stream().mapToLong(NamedAmount::amountPaise).sum() + salaryEstimatedPaise;
        }
    }

    public FixedSpend fixedSpend(UUID propertyId, LocalDate from, LocalDate to) {
        // A reversal is a REVERSAL row, so it is found through the entry it reverses.
        List<NamedAmount> recurring = jdbc.query("""
                SELECT MIN(TRIM(COALESCE(e.paid_to, reversed.paid_to))) AS name, SUM(e.amount_paise) AS amount,
                       COUNT(*) FILTER (WHERE e.entry_type <> 'REVERSAL') AS items
                FROM expense.expenses e
                LEFT JOIN expense.expenses reversed ON reversed.id = e.reverses_expense_id
                WHERE e.property_id = :propertyId AND e.incurred_date BETWEEN :from AND :to
                  AND (e.entry_type = 'RECURRING' OR reversed.entry_type = 'RECURRING')
                GROUP BY LOWER(TRIM(COALESCE(e.paid_to, reversed.paid_to)))
                HAVING SUM(e.amount_paise) <> 0
                ORDER BY amount DESC, name
                """, range(propertyId, from, to),
                (rs, i) -> new NamedAmount(rs.getString("name"), rs.getLong("amount"), rs.getInt("items")));
        long estimated = 0;
        for (YearMonth m = YearMonth.from(from); !m.isAfter(YearMonth.from(to)); m = m.plusMonths(1)) {
            estimated += expenseService.projectedSalaryPaise(propertyId, m.atDay(1));
        }
        return new FixedSpend(recurring, estimated);
    }

    /** The budget in force for a month, and that month's spend, as the budget screen shows them. */
    public record MonthBudget(Long budgetPaise, long spentPaise) {}

    public MonthBudget budget(UUID propertyId, YearMonth month) {
        ExpenseBudgetOverviewResponse overview = budgetService.getInternalOverview(propertyId, month.atDay(1));
        return new MonthBudget(overview.effectiveBudgetPaise(), overview.spentPaise());
    }
}
