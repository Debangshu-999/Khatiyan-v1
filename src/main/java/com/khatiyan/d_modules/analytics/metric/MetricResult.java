package com.khatiyan.d_modules.analytics.metric;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One metric as the app and, later, the AI read it (spec §6.5).
 *
 * <p>Keys never change once shipped: {@code metricKey.figureKey} is the AI's
 * evidence id, so renaming one is the same mistake as deleting a persisted enum
 * constant.
 */
public record MetricResult(
        String key,
        MetricScope scope,
        MetricStatus status,
        long sampleSize,
        List<Figure> figures,
        List<Part> parts,
        List<SeriesPoint> series,
        Unit partUnit,
        Unit seriesUnit) {

    public static Builder of(MetricKey key) {
        return new Builder(key);
    }

    public static MetricResult unavailable(MetricKey key) {
        return of(key).status(MetricStatus.UNAVAILABLE).build();
    }

    public static final class Builder {
        private final MetricKey key;
        private MetricStatus status = MetricStatus.OK;
        private long sampleSize;
        private final List<Figure> figures = new ArrayList<>();
        private final List<Part> parts = new ArrayList<>();
        private final List<SeriesPoint> series = new ArrayList<>();
        private Unit partUnit;
        private Unit seriesUnit;

        private Builder(MetricKey key) {
            this.key = key;
        }

        public Builder status(MetricStatus status) {
            this.status = status;
            return this;
        }

        public Builder sampleSize(long sampleSize) {
            this.sampleSize = sampleSize;
            return this;
        }

        public Builder figure(String figureKey, Unit unit, long value, Long previous) {
            figures.add(new Figure(figureKey, unit, value, previous));
            return this;
        }

        public Builder part(String partKey, String label, long value, Long count) {
            parts.add(new Part(partKey, label, value, count));
            return this;
        }

        public Builder partUnit(Unit unit) {
            this.partUnit = unit;
            return this;
        }

        public Builder point(LocalDate from, LocalDate to, Map<String, Long> values) {
            series.add(new SeriesPoint(from, to, Collections.unmodifiableMap(new LinkedHashMap<>(values))));
            return this;
        }

        public Builder seriesUnit(Unit unit) {
            this.seriesUnit = unit;
            return this;
        }

        public MetricResult build() {
            return new MetricResult(key.key(), key.scope(), status, sampleSize,
                    List.copyOf(figures), List.copyOf(parts), List.copyOf(series), partUnit, seriesUnit);
        }
    }
}
