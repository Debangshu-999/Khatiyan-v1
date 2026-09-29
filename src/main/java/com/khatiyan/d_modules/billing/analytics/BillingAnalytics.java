package com.khatiyan.d_modules.billing.analytics;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The billing module's answers for owner analytics. Reads the {@code billing}
 * schema only. Every method is property-scoped and returns plain records, so
 * the analytics module never sees an entity or a repository.
 *
 * <p>Bills count by the month they bill ({@code period_start_date}); payments by
 * the IST day they were made. Cancelled bills never count as billed.
 */
@Component
public class BillingAnalytics {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final NamedParameterJdbcTemplate jdbc;

    public BillingAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static MapSqlParameterSource range(UUID propertyId, LocalDate from, LocalDate to) {
        return new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to);
    }

    // ---- Snapshot figures ------------------------------------------------

    public record DuesTotals(long outstandingPaise, long overduePaise) {}

    /** Every unpaid bill, including ones already raised for a later month. */
    public DuesTotals duesTotals(UUID propertyId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(total_amount_paise), 0) AS outstanding,
                       COALESCE(SUM(total_amount_paise) FILTER (WHERE status = 'OVERDUE'), 0) AS overdue
                FROM billing.billing_cycles
                WHERE property_id = :propertyId
                  AND status IN ('UPCOMING', 'UNPAID', 'OVERDUE', 'CONFIRMATION_PENDING')
                """, Map.of("propertyId", propertyId),
                (rs, i) -> new DuesTotals(rs.getLong("outstanding"), rs.getLong("overdue")));
    }

    /**
     * Deposits still held, and deposits closed at end-tenancy but not yet paid out.
     * The balance is the ledger's additions less its deductions: the account
     * caches nothing, by design.
     */
    public record Deposits(long heldPaise, int heldAccounts, long awaitingSettlementPaise, int awaitingSettlementAccounts) {}

    public Deposits deposits(UUID propertyId) {
        return jdbc.queryForObject("""
                WITH balances AS (
                    SELECT a.id, a.status,
                           COALESCE(SUM(CASE WHEN m.type = 'ADDITION' THEN m.amount_paise ELSE -m.amount_paise END), 0) AS balance
                    FROM billing.deposit_accounts a
                    LEFT JOIN billing.deposit_movements m ON m.deposit_account_id = a.id
                    WHERE a.property_id = :propertyId AND a.status IN ('ACTIVE', 'PENDING_SETTLEMENT')
                    GROUP BY a.id, a.status
                )
                SELECT COALESCE(SUM(balance) FILTER (WHERE status = 'ACTIVE'), 0) AS held,
                       COUNT(*) FILTER (WHERE status = 'ACTIVE' AND balance > 0) AS held_accounts,
                       COALESCE(SUM(balance) FILTER (WHERE status = 'PENDING_SETTLEMENT'), 0) AS awaiting,
                       COUNT(*) FILTER (WHERE status = 'PENDING_SETTLEMENT') AS awaiting_accounts
                FROM balances
                """, Map.of("propertyId", propertyId), (rs, i) -> new Deposits(
                rs.getLong("held"), rs.getInt("held_accounts"), rs.getLong("awaiting"), rs.getInt("awaiting_accounts")));
    }

    // ---- Billing division --------------------------------------------------

    public record DuesBreakdown(long overduePaise, long dueNowPaise, long dueThisWeekPaise, long laterPaise, int bills) {}

    /**
     * Unpaid bills by urgency. "Due now" means the due date has come and the
     * grace days are still running: past due, not yet overdue.
     */
    public DuesBreakdown dues(UUID propertyId, LocalDate today) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(total_amount_paise) FILTER (WHERE status = 'OVERDUE'), 0) AS overdue,
                       COALESCE(SUM(total_amount_paise) FILTER (WHERE status <> 'OVERDUE' AND rent_due_date <= :today), 0) AS due_now,
                       COALESCE(SUM(total_amount_paise) FILTER (WHERE status <> 'OVERDUE' AND rent_due_date > :today AND rent_due_date <= :weekEnd), 0) AS this_week,
                       COALESCE(SUM(total_amount_paise) FILTER (WHERE status <> 'OVERDUE' AND rent_due_date > :weekEnd), 0) AS later,
                       COUNT(*) AS bills
                FROM billing.billing_cycles
                WHERE property_id = :propertyId
                  AND status IN ('UPCOMING', 'UNPAID', 'OVERDUE', 'CONFIRMATION_PENDING')
                """, new MapSqlParameterSource()
                .addValue("propertyId", propertyId).addValue("today", today).addValue("weekEnd", today.plusDays(7)),
                (rs, i) -> new DuesBreakdown(rs.getLong("overdue"), rs.getLong("due_now"), rs.getLong("this_week"),
                        rs.getLong("later"), rs.getInt("bills")));
    }

    public record AgeingBucket(String bucket, long amountPaise, int bills) {}

    public List<AgeingBucket> overdueAgeing(UUID propertyId, LocalDate today) {
        return jdbc.query("""
                SELECT CASE WHEN days <= 7 THEN 'D1_7' WHEN days <= 15 THEN 'D8_15' WHEN days <= 30 THEN 'D16_30'
                            WHEN days <= 60 THEN 'D31_60' ELSE 'D60_PLUS' END AS bucket,
                       SUM(total_amount_paise) AS amount, COUNT(*) AS bills
                FROM (SELECT total_amount_paise, (CAST(:today AS date) - rent_due_date) AS days
                      FROM billing.billing_cycles WHERE property_id = :propertyId AND status = 'OVERDUE') overdue
                GROUP BY 1
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("today", today),
                (rs, i) -> new AgeingBucket(rs.getString("bucket"), rs.getLong("amount"), rs.getInt("bills")));
    }

    public record StatusCount(String status, int bills) {}

    /** Bills FOR the range (by the month they bill), cancelled ones included so the card can say how many it left out. */
    public List<StatusCount> statusCounts(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT status, COUNT(*) AS bills FROM billing.billing_cycles
                WHERE property_id = :propertyId AND period_start_date BETWEEN :from AND :to
                GROUP BY status
                """, range(propertyId, from, to), (rs, i) -> new StatusCount(rs.getString("status"), rs.getInt("bills")));
    }

    public record CategoryTotal(String category, long amountPaise, int bills) {}

    public List<CategoryTotal> billedByCategory(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT COALESCE(category, 'RENT_CYCLE') AS category, COALESCE(SUM(total_amount_paise), 0) AS amount, COUNT(*) AS bills
                FROM billing.billing_cycles
                WHERE property_id = :propertyId AND status <> 'CANCELLED' AND period_start_date BETWEEN :from AND :to
                GROUP BY 1
                """, range(propertyId, from, to),
                (rs, i) -> new CategoryTotal(rs.getString("category"), rs.getLong("amount"), rs.getInt("bills")));
    }

    public record LabelTotal(String label, long amountPaise, int items) {}

    /** One-off charges grouped by name, ignoring case and stray spaces. The first spelling seen is the one shown. */
    public List<LabelTotal> oneOffReasons(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT MIN(TRIM(li.label)) AS label, SUM(li.amount_paise) AS amount, COUNT(*) AS items
                FROM billing.billing_cycle_line_items li
                JOIN billing.billing_cycles c ON c.id = li.billing_cycle_id
                WHERE c.property_id = :propertyId AND c.category = 'ONE_OFF' AND c.status <> 'CANCELLED'
                  AND c.period_start_date BETWEEN :from AND :to
                  AND li.type = 'EXTRA_CHARGE' AND COALESCE(li.status, 'ADDED') <> 'CANCELLED'
                GROUP BY LOWER(TRIM(li.label))
                ORDER BY amount DESC, label
                """, range(propertyId, from, to),
                (rs, i) -> new LabelTotal(rs.getString("label"), rs.getLong("amount"), rs.getInt("items")));
    }

    public record MethodTotal(String method, long amountPaise, int payments) {}

    /** Money received in the range, by the IST day it was paid. */
    public List<MethodTotal> paymentsByMethod(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT method, SUM(amount_paise) AS amount, COUNT(*) AS payments
                FROM billing.billing_manual_payments
                WHERE property_id = :propertyId AND collected_at >= :fromTs AND collected_at < :toTs
                GROUP BY method
                """, new MapSqlParameterSource()
                .addValue("propertyId", propertyId)
                .addValue("fromTs", Timestamp.from(from.atStartOfDay(IST).toInstant()))
                .addValue("toTs", Timestamp.from(to.plusDays(1).atStartOfDay(IST).toInstant())),
                (rs, i) -> new MethodTotal(rs.getString("method"), rs.getLong("amount"), rs.getInt("payments")));
    }

    public record Unrecorded(long amountPaise, int bills) {}

    /**
     * Bills marked PAID in the range, by IST paid date, that have no payment
     * record, so nobody knows how they were paid. Collections by mode leaves them
     * out and says how much it left out, rather than dropping it silently.
     */
    public Unrecorded paidWithoutRecord(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(c.total_amount_paise), 0) AS amount, COUNT(*) AS bills
                FROM billing.billing_cycles c
                WHERE c.property_id = :propertyId AND c.status = 'PAID'
                  AND c.paid_at >= :fromTs AND c.paid_at < :toTs
                  AND NOT EXISTS (SELECT 1 FROM billing.billing_manual_payments p WHERE p.billing_cycle_id = c.id)
                """, new MapSqlParameterSource()
                .addValue("propertyId", propertyId)
                .addValue("fromTs", Timestamp.from(from.atStartOfDay(IST).toInstant()))
                .addValue("toTs", Timestamp.from(to.plusDays(1).atStartOfDay(IST).toInstant())),
                (rs, i) -> new Unrecorded(rs.getLong("amount"), rs.getInt("bills")));
    }

    public record CollectionTotals(long billedPaise, long collectedPaise, int bills) {}

    /**
     * Bills for the range that have fallen due, and what has been paid against
     * them so far. A bill not yet due cannot be collected yet, so counting it
     * would drag every current-month rate down.
     *
     * <p>A PAID bill counts in full whatever its payment rows say. Bills paid
     * before the payment log existed (it starts 18 Jun 2026) are PAID with no
     * row at all; summing rows alone reported them as never collected. Rows
     * still decide how much of an unpaid bill has come in.
     */
    public CollectionTotals collection(UUID propertyId, LocalDate from, LocalDate to, LocalDate today) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(c.total_amount_paise), 0) AS billed,
                       COALESCE(SUM(CASE WHEN c.status = 'PAID' THEN c.total_amount_paise
                                         ELSE LEAST(COALESCE(p.paid, 0), c.total_amount_paise) END), 0) AS collected,
                       COUNT(*) AS bills
                FROM billing.billing_cycles c
                LEFT JOIN (SELECT billing_cycle_id, SUM(amount_paise) AS paid
                           FROM billing.billing_manual_payments GROUP BY billing_cycle_id) p ON p.billing_cycle_id = c.id
                WHERE c.property_id = :propertyId AND c.status <> 'CANCELLED'
                  AND c.period_start_date BETWEEN :from AND :to AND c.rent_due_date <= :today
                """, range(propertyId, from, to).addValue("today", today),
                (rs, i) -> new CollectionTotals(rs.getLong("billed"), rs.getLong("collected"), rs.getInt("bills")));
    }

    public record Timeliness(int onTime, int late) {
        public int total() {
            return onTime + late;
        }
    }

    /**
     * Paid bills by the due date or after it, on the IST day of payment.
     *
     * <p>{@code rent_due_date} is the LAST day of the payment window: the period
     * start plus the grace days, already (BillingCycleService
     * .calculateMonthlyDueDate). A bill cannot be paid before its window opens,
     * so there are two outcomes only. This used to add the grace days a second
     * time and split "before the due date" from "within the grace days", which
     * filed some late payments as on time (owner's correction, 2026-09-27).
     *
     * <p>Rent bills only (owner's call, same day). A one-off bill never goes
     * overdue and never carries a late fee, so calling one "late" here would
     * disagree with every other screen.
     */
    public Timeliness timeliness(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FILTER (WHERE paid_day <= rent_due_date) AS on_time,
                       COUNT(*) FILTER (WHERE paid_day > rent_due_date) AS late
                FROM (SELECT rent_due_date, (paid_at AT TIME ZONE 'Asia/Kolkata')::date AS paid_day
                      FROM billing.billing_cycles
                      WHERE property_id = :propertyId AND status = 'PAID' AND paid_at IS NOT NULL
                        AND COALESCE(category, 'RENT_CYCLE') = 'RENT_CYCLE'
                        AND period_start_date BETWEEN :from AND :to) paid
                """, range(propertyId, from, to),
                (rs, i) -> new Timeliness(rs.getInt("on_time"), rs.getInt("late")));
    }

    public record FeesAndDiscounts(long lateFeesPaise, int lateFeeBills, long discountsPaise, int discountBills, int bills) {}

    public FeesAndDiscounts feesAndDiscounts(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(late_fee_amount_paise), 0) AS late_fees,
                       COUNT(*) FILTER (WHERE late_fee_amount_paise > 0) AS late_fee_bills,
                       COALESCE(SUM(discount_amount_paise), 0) AS discounts,
                       COUNT(*) FILTER (WHERE discount_amount_paise > 0) AS discount_bills,
                       COUNT(*) AS bills
                FROM billing.billing_cycles
                WHERE property_id = :propertyId AND status <> 'CANCELLED' AND period_start_date BETWEEN :from AND :to
                """, range(propertyId, from, to), (rs, i) -> new FeesAndDiscounts(rs.getLong("late_fees"),
                rs.getInt("late_fee_bills"), rs.getLong("discounts"), rs.getInt("discount_bills"), rs.getInt("bills")));
    }

    public record PendingClaims(int claims, long amountPaise) {}

    public PendingClaims pendingUpiClaims(UUID propertyId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) AS claims, COALESCE(SUM(amount_paise), 0) AS amount
                FROM billing.payment_intents WHERE property_id = :propertyId AND status = 'TENANT_CONFIRMED'
                """, Map.of("propertyId", propertyId), (rs, i) -> new PendingClaims(rs.getInt("claims"), rs.getLong("amount")));
    }
}
