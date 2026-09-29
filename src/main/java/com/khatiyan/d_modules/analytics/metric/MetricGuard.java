package com.khatiyan.d_modules.analytics.metric;

import java.util.List;
import java.util.function.Supplier;

import lombok.extern.slf4j.Slf4j;

/**
 * Computes one metric in isolation (spec §6.3).
 *
 * <p>A metric the caller cannot see is never computed, so its queries never
 * run. A metric whose query throws becomes UNAVAILABLE, is logged with its key,
 * and does not take the rest of the division down with it.
 */
@Slf4j
public final class MetricGuard {

    private MetricGuard() {
    }

    public static void add(List<MetricResult> out, AnalyticsContext context, MetricKey key, Supplier<MetricResult> compute) {
        if (!context.wants(key)) {
            return;
        }
        try {
            out.add(compute.get());
        } catch (RuntimeException e) {
            log.warn("Analytics metric {} failed for property {}", key.key(), context.propertyId(), e);
            out.add(MetricResult.unavailable(key));
        }
    }
}
