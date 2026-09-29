package com.khatiyan.d_modules.analytics.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Part;
import com.khatiyan.d_modules.analytics.period.AnalyticsPeriodResolver;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;

class BillingAnalyticsAssemblerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private final UUID property = UUID.randomUUID();
    private BillingAnalytics billing;
    private BillingAnalyticsAssembler assembler;

    @BeforeEach
    void setUp() {
        billing = mock(BillingAnalytics.class);
        assembler = new BillingAnalyticsAssembler(billing);
    }

    private AnalyticsContext context(MetricKey first, MetricKey... rest) {
        return new AnalyticsContext(property,
                AnalyticsPeriodResolver.resolve(PeriodPreset.LAST_3_MONTHS, null, null, TODAY, LocalDate.of(2025, 1, 1)),
                TODAY, EnumSet.of(first, rest));
    }

    private MetricResult only(List<MetricResult> results) {
        assertThat(results).hasSize(1);
        return results.get(0);
    }

    @Test
    void duesListTheirFourPartsInOrder() {
        when(billing.dues(property, TODAY)).thenReturn(new BillingAnalytics.DuesBreakdown(5000, 4000, 2000, 4000, 5));
        MetricResult dues = only(assembler.assemble(context(MetricKey.BILLING_DUES)));
        assertThat(dues.parts()).extracting(Part::key).containsExactly("OVERDUE", "DUE_NOW", "DUE_THIS_WEEK", "LATER");
        assertThat(dues.figures().get(0).value()).isEqualTo(15000);
        assertThat(dues.status()).isEqualTo(MetricStatus.OK);
    }

    @Test
    void ageingZeroFillsEveryBucket() {
        when(billing.overdueAgeing(property, TODAY)).thenReturn(List.of(new BillingAnalytics.AgeingBucket("D16_30", 2000, 1)));
        MetricResult ageing = only(assembler.assemble(context(MetricKey.BILLING_OVERDUE_AGEING)));
        assertThat(ageing.parts()).extracting(Part::key).containsExactly("D1_7", "D8_15", "D16_30", "D31_60", "D60_PLUS");
        assertThat(ageing.parts()).extracting(Part::value).containsExactly(0L, 0L, 2000L, 0L, 0L);
    }

    @Test
    void collectionRateIsTooFewBelowFiveBillsAndComparesOnlyAComparableWindow() {
        when(billing.collection(eq(property), eq(LocalDate.of(2026, 7, 1)), eq(TODAY), eq(TODAY)))
                .thenReturn(new BillingAnalytics.CollectionTotals(15000, 12000, 3));
        when(billing.collection(eq(property), eq(LocalDate.of(2026, 4, 1)), eq(LocalDate.of(2026, 6, 26)), eq(TODAY)))
                .thenReturn(new BillingAnalytics.CollectionTotals(9000, 9000, 2));
        MetricResult rate = only(assembler.assemble(context(MetricKey.BILLING_COLLECTION_RATE)));
        assertThat(rate.status()).isEqualTo(MetricStatus.TOO_FEW);
        assertThat(rate.figures()).allSatisfy(figure -> assertThat(figure.previous()).isNull());
    }

    @Test
    void modesFoldUnknownMethodsIntoOther() {
        when(billing.paymentsByMethod(any(), any(), any())).thenReturn(List.of(
                new BillingAnalytics.MethodTotal("UPI", 6000, 2),
                new BillingAnalytics.MethodTotal("CASH", 4000, 1),
                new BillingAnalytics.MethodTotal("NEFT", 500, 1)));
        when(billing.paidWithoutRecord(any(), any(), any())).thenReturn(new BillingAnalytics.Unrecorded(107055, 11));
        MetricResult modes = only(assembler.assemble(context(MetricKey.BILLING_COLLECTIONS_BY_MODE)));
        assertThat(modes.parts()).extracting(Part::key).containsExactly("UPI", "CASH", "CARD", "CHEQUE", "OTHER");
        assertThat(modes.parts().get(4).value()).isEqualTo(500);
        assertThat(modes.sampleSize()).isEqualTo(4);
        assertThat(modes.figures()).anySatisfy(figure -> {
            assertThat(figure.key()).isEqualTo("unrecorded");
            assertThat(figure.value()).isEqualTo(107055);
        });
    }

    @Test
    void reasonsKeepTheTopThreeAndFoldTheRest() {
        when(billing.oneOffReasons(any(), any(), any())).thenReturn(List.of(
                new BillingAnalytics.LabelTotal("Electricity", 1800, 3),
                new BillingAnalytics.LabelTotal("Laundry", 900, 2),
                new BillingAnalytics.LabelTotal("Damages", 600, 1),
                new BillingAnalytics.LabelTotal("Keys", 200, 1),
                new BillingAnalytics.LabelTotal("Guest", 100, 1)));
        MetricResult reasons = only(assembler.assemble(context(MetricKey.BILLING_ONE_OFF_REASONS)));
        assertThat(reasons.parts()).extracting(Part::key).containsExactly("electricity", "laundry", "damages", "OTHER");
        assertThat(reasons.parts().get(3).value()).isEqualTo(300);
        assertThat(reasons.parts().get(0).label()).isEqualTo("Electricity");
    }

    @Test
    void aQueryThatThrowsTakesOnlyItsOwnCardDown() {
        when(billing.dues(property, TODAY)).thenThrow(new IllegalStateException("boom"));
        when(billing.pendingUpiClaims(property)).thenReturn(new BillingAnalytics.PendingClaims(2, 3000));
        List<MetricResult> results = assembler.assemble(context(MetricKey.BILLING_DUES, MetricKey.BILLING_UPI_CLAIMS_PENDING));
        assertThat(results).extracting(MetricResult::status).containsExactly(MetricStatus.UNAVAILABLE, MetricStatus.OK);
    }

    @Test
    void aManagerNeverTriggersTheClaimsQuery() {
        when(billing.dues(property, TODAY)).thenReturn(new BillingAnalytics.DuesBreakdown(0, 0, 0, 0, 0));
        List<MetricResult> results = assembler.assemble(context(MetricKey.BILLING_DUES));
        assertThat(results).extracting(MetricResult::key).containsExactly("billing.dues");
    }
}
