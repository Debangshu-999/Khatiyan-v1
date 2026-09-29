package com.khatiyan.d_modules.analytics.metric;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.analytics.period.AnalyticsPeriodResolver;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;

class MetricGuardTest {

    private final AnalyticsContext context = new AnalyticsContext(
            UUID.randomUUID(),
            AnalyticsPeriodResolver.resolve(PeriodPreset.LAST_MONTH, null, null, LocalDate.of(2026, 9, 26), LocalDate.of(2026, 1, 1)),
            LocalDate.of(2026, 9, 26),
            EnumSet.of(MetricKey.BILLING_DUES));

    @Test
    void aFailingMetricBecomesUnavailableAndTheRestCarryOn() {
        List<MetricResult> out = new ArrayList<>();
        MetricGuard.add(out, context, MetricKey.BILLING_DUES, () -> {
            throw new IllegalStateException("boom");
        });
        assertThat(out).singleElement().satisfies(result -> {
            assertThat(result.key()).isEqualTo("billing.dues");
            assertThat(result.status()).isEqualTo(MetricStatus.UNAVAILABLE);
        });
    }

    @Test
    void aMetricTheCallerCannotSeeIsNeverComputed() {
        List<MetricResult> out = new ArrayList<>();
        MetricGuard.add(out, context, MetricKey.BILLING_COLLECTION_RATE, () -> {
            throw new AssertionError("must not run");
        });
        assertThat(out).isEmpty();
    }

    @Test
    void theSampleRuleSaysNoDataThenTooFewThenOk() {
        assertThat(MetricRules.statusForSample(0)).isEqualTo(MetricStatus.NO_DATA);
        assertThat(MetricRules.statusForSample(4)).isEqualTo(MetricStatus.TOO_FEW);
        assertThat(MetricRules.statusForSample(5)).isEqualTo(MetricStatus.OK);
    }
}
