package com.khatiyan.d_modules.analytics.metric;

public enum MetricStatus {
    OK,
    /** Below the minimum sample: the card shows the count and "Too few to compare". */
    TOO_FEW,
    NO_DATA,
    /** Its query failed. Logged with the key, and the rest of the division still renders. */
    UNAVAILABLE
}
