package com.khatiyan.d_modules.analytics.billing;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.DivisionAssembler;
import com.khatiyan.d_modules.analytics.metric.MetricGuard;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricRules;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Unit;
import com.khatiyan.d_modules.analytics.period.DateRange;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;

/** The Billing division, spec §5.1. Every metric is computed in isolation by MetricGuard. */
@Component
public class BillingAnalyticsAssembler implements DivisionAssembler {

    private static final List<String> AGEING = List.of("D1_7", "D8_15", "D16_30", "D31_60", "D60_PLUS");
    private static final List<String> STATUSES = List.of("PAID", "UNPAID", "OVERDUE", "CONFIRMATION_PENDING", "UPCOMING");
    /** Named payment modes. Anything else a payment was recorded as folds into OTHER. */
    private static final List<String> METHODS = List.of("UPI", "CASH", "CARD", "CHEQUE");
    private static final List<String> CATEGORIES = List.of("RENT_CYCLE", "ONE_OFF");
    private static final int TOP_REASONS = 3;

    private final BillingAnalytics billing;

    public BillingAnalyticsAssembler(BillingAnalytics billing) {
        this.billing = billing;
    }

    @Override
    public AnalyticsDivision division() {
        return AnalyticsDivision.BILLING;
    }

    @Override
    public List<MetricResult> assemble(AnalyticsContext context) {
        UUID p = context.propertyId();
        LocalDate today = context.today();
        DateRange range = context.period().range();
        DateRange before = context.period().comparison();
        List<MetricResult> out = new ArrayList<>();

        MetricGuard.add(out, context, MetricKey.BILLING_DUES, () -> dues(p, today));
        MetricGuard.add(out, context, MetricKey.BILLING_OVERDUE_AGEING, () -> ageing(p, today));
        MetricGuard.add(out, context, MetricKey.BILLING_UPI_CLAIMS_PENDING, () -> claims(p));
        MetricGuard.add(out, context, MetricKey.BILLING_COLLECTION_RATE, () -> collectionRate(p, range, before, today));
        MetricGuard.add(out, context, MetricKey.BILLING_STATUS_MIX, () -> statusMix(p, range));
        MetricGuard.add(out, context, MetricKey.BILLING_COLLECTIONS_BY_MODE, () -> modes(p, range, before));
        MetricGuard.add(out, context, MetricKey.BILLING_BILL_TYPES, () -> billTypes(p, range));
        MetricGuard.add(out, context, MetricKey.BILLING_ONE_OFF_REASONS, () -> reasons(p, range));
        MetricGuard.add(out, context, MetricKey.BILLING_PAYMENT_TIMELINESS, () -> timeliness(p, range));
        MetricGuard.add(out, context, MetricKey.BILLING_LATE_FEES_DISCOUNTS, () -> fees(p, range, before));
        return out;
    }

    private MetricResult dues(UUID p, LocalDate today) {
        BillingAnalytics.DuesBreakdown d = billing.dues(p, today);
        long total = d.overduePaise() + d.dueNowPaise() + d.dueThisWeekPaise() + d.laterPaise();
        return MetricResult.of(MetricKey.BILLING_DUES)
                .status(d.bills() == 0 ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(d.bills())
                .figure("total", Unit.PAISE, total, null)
                .partUnit(Unit.PAISE)
                .part("OVERDUE", null, d.overduePaise(), null)
                .part("DUE_NOW", null, d.dueNowPaise(), null)
                .part("DUE_THIS_WEEK", null, d.dueThisWeekPaise(), null)
                .part("LATER", null, d.laterPaise(), null)
                .build();
    }

    private MetricResult ageing(UUID p, LocalDate today) {
        Map<String, BillingAnalytics.AgeingBucket> byKey = new HashMap<>();
        billing.overdueAgeing(p, today).forEach(bucket -> byKey.put(bucket.bucket(), bucket));
        MetricResult.Builder builder = MetricResult.of(MetricKey.BILLING_OVERDUE_AGEING).partUnit(Unit.PAISE);
        int bills = 0;
        for (String key : AGEING) {
            BillingAnalytics.AgeingBucket bucket = byKey.get(key);
            builder.part(key, null, bucket == null ? 0 : bucket.amountPaise(), bucket == null ? 0L : (long) bucket.bills());
            bills += bucket == null ? 0 : bucket.bills();
        }
        return builder.sampleSize(bills).status(bills == 0 ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    private MetricResult claims(UUID p) {
        BillingAnalytics.PendingClaims claims = billing.pendingUpiClaims(p);
        return MetricResult.of(MetricKey.BILLING_UPI_CLAIMS_PENDING)
                .sampleSize(claims.claims())
                .figure("claims", Unit.COUNT, claims.claims(), null)
                .figure("amount", Unit.PAISE, claims.amountPaise(), null)
                .build();
    }

    private MetricResult collectionRate(UUID p, DateRange range, DateRange before, LocalDate today) {
        BillingAnalytics.CollectionTotals now = billing.collection(p, range.from(), range.to(), today);
        BillingAnalytics.CollectionTotals then = before == null ? null : billing.collection(p, before.from(), before.to(), today);
        long thenSample = then == null ? 0 : then.bills();
        return MetricResult.of(MetricKey.BILLING_COLLECTION_RATE)
                .status(MetricRules.statusForSample(now.bills()))
                .sampleSize(now.bills())
                .figure("collected", Unit.PAISE, now.collectedPaise(),
                        MetricRules.previousIfComparable(then == null ? null : then.collectedPaise(), thenSample))
                .figure("billed", Unit.PAISE, now.billedPaise(),
                        MetricRules.previousIfComparable(then == null ? null : then.billedPaise(), thenSample))
                .build();
    }

    private MetricResult statusMix(UUID p, DateRange range) {
        Map<String, Integer> counts = new HashMap<>();
        billing.statusCounts(p, range.from(), range.to()).forEach(row -> counts.put(row.status(), row.bills()));
        MetricResult.Builder builder = MetricResult.of(MetricKey.BILLING_STATUS_MIX).partUnit(Unit.COUNT);
        int live = 0;
        for (String status : STATUSES) {
            int count = counts.getOrDefault(status, 0);
            builder.part(status, null, count, null);
            live += count;
        }
        return builder
                .figure("cancelled", Unit.COUNT, counts.getOrDefault("CANCELLED", 0), null)
                .sampleSize(live)
                .status(live == 0 ? MetricStatus.NO_DATA : MetricStatus.OK)
                .build();
    }

    private MetricResult modes(UUID p, DateRange range, DateRange before) {
        Map<String, long[]> byMethod = new HashMap<>();
        long received = 0;
        int payments = 0;
        for (BillingAnalytics.MethodTotal row : billing.paymentsByMethod(p, range.from(), range.to())) {
            String key = METHODS.contains(row.method()) ? row.method() : "OTHER";
            long[] totals = byMethod.computeIfAbsent(key, k -> new long[2]);
            totals[0] += row.amountPaise();
            totals[1] += row.payments();
            received += row.amountPaise();
            payments += row.payments();
        }
        Long previous = null;
        if (before != null) {
            previous = billing.paymentsByMethod(p, before.from(), before.to()).stream()
                    .mapToLong(BillingAnalytics.MethodTotal::amountPaise).sum();
        }
        // Paid bills with no payment record have no mode to show. They are left
        // out of the slices, and the card says how much was left out.
        BillingAnalytics.Unrecorded unrecorded = billing.paidWithoutRecord(p, range.from(), range.to());
        MetricResult.Builder builder = MetricResult.of(MetricKey.BILLING_COLLECTIONS_BY_MODE).partUnit(Unit.PAISE);
        for (String key : List.of("UPI", "CASH", "CARD", "CHEQUE", "OTHER")) {
            long[] totals = byMethod.getOrDefault(key, new long[2]);
            builder.part(key, null, totals[0], totals[1]);
        }
        return builder
                .figure("received", Unit.PAISE, received, previous)
                .figure("payments", Unit.COUNT, payments, null)
                .figure("unrecorded", Unit.PAISE, unrecorded.amountPaise(), null)
                .figure("unrecorded_bills", Unit.COUNT, unrecorded.bills(), null)
                .sampleSize(payments)
                .status(payments == 0 ? MetricStatus.NO_DATA : MetricStatus.OK)
                .build();
    }

    private MetricResult billTypes(UUID p, DateRange range) {
        Map<String, BillingAnalytics.CategoryTotal> byCategory = new HashMap<>();
        billing.billedByCategory(p, range.from(), range.to()).forEach(row -> byCategory.put(row.category(), row));
        MetricResult.Builder builder = MetricResult.of(MetricKey.BILLING_BILL_TYPES).partUnit(Unit.PAISE);
        int bills = 0;
        for (String category : CATEGORIES) {
            BillingAnalytics.CategoryTotal row = byCategory.get(category);
            builder.part(category, null, row == null ? 0 : row.amountPaise(), row == null ? 0L : (long) row.bills());
            bills += row == null ? 0 : row.bills();
        }
        return builder.sampleSize(bills).status(bills == 0 ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    private MetricResult reasons(UUID p, DateRange range) {
        List<BillingAnalytics.LabelTotal> rows = billing.oneOffReasons(p, range.from(), range.to());
        MetricResult.Builder builder = MetricResult.of(MetricKey.BILLING_ONE_OFF_REASONS).partUnit(Unit.PAISE);
        long otherAmount = 0;
        long otherItems = 0;
        int items = 0;
        for (int i = 0; i < rows.size(); i++) {
            BillingAnalytics.LabelTotal row = rows.get(i);
            items += row.items();
            if (i < TOP_REASONS) {
                builder.part(row.label().toLowerCase(Locale.ROOT), row.label(), row.amountPaise(), (long) row.items());
            } else {
                otherAmount += row.amountPaise();
                otherItems += row.items();
            }
        }
        if (otherItems > 0) {
            builder.part("OTHER", null, otherAmount, otherItems);
        }
        return builder.sampleSize(items).status(items == 0 ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    private MetricResult timeliness(UUID p, DateRange range) {
        BillingAnalytics.Timeliness t = billing.timeliness(p, range.from(), range.to());
        return MetricResult.of(MetricKey.BILLING_PAYMENT_TIMELINESS)
                .status(MetricRules.statusForSample(t.total()))
                .sampleSize(t.total())
                .partUnit(Unit.COUNT)
                .part("ON_TIME", null, t.onTime(), null)
                .part("LATE", null, t.late(), null)
                .build();
    }

    private MetricResult fees(UUID p, DateRange range, DateRange before) {
        BillingAnalytics.FeesAndDiscounts now = billing.feesAndDiscounts(p, range.from(), range.to());
        BillingAnalytics.FeesAndDiscounts then = before == null ? null : billing.feesAndDiscounts(p, before.from(), before.to());
        return MetricResult.of(MetricKey.BILLING_LATE_FEES_DISCOUNTS)
                .status(now.bills() == 0 ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(now.bills())
                .figure("late_fees", Unit.PAISE, now.lateFeesPaise(), then == null ? null : then.lateFeesPaise())
                .figure("late_fee_bills", Unit.COUNT, now.lateFeeBills(), null)
                .figure("discounts", Unit.PAISE, now.discountsPaise(), then == null ? null : then.discountsPaise())
                .figure("discount_bills", Unit.COUNT, now.discountBills(), null)
                .build();
    }
}
