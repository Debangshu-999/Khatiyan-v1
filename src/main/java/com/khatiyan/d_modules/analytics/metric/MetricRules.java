package com.khatiyan.d_modules.analytics.metric;

/** The minimum-sample rule, spec §2.4. */
public final class MetricRules {

    /** Medians and rates need at least this many items. */
    public static final int MIN_SAMPLE = 5;
    /** A 90th percentile needs at least this many. */
    public static final int MIN_SAMPLE_P90 = 10;

    private MetricRules() {
    }

    public static MetricStatus statusForSample(long sampleSize) {
        if (sampleSize <= 0) {
            return MetricStatus.NO_DATA;
        }
        return sampleSize < MIN_SAMPLE ? MetricStatus.TOO_FEW : MetricStatus.OK;
    }

    /** A previous value is shown only if its own window had enough items to compare. */
    public static Long previousIfComparable(Long previous, long previousSample) {
        return previous != null && previousSample >= MIN_SAMPLE ? previous : null;
    }
}
