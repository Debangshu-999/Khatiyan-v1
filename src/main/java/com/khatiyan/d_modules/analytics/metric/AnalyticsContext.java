package com.khatiyan.d_modules.analytics.metric;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.analytics.period.ResolvedPeriod;

/** What one division request asks for. {@code visible} is already permission-filtered. */
public record AnalyticsContext(UUID propertyId, ResolvedPeriod period, LocalDate today, Set<MetricKey> visible) {

    public boolean wants(MetricKey key) {
        return visible.contains(key);
    }
}
