package com.khatiyan.d_modules.analytics.period;

/** How a trend splits its range. NONE collapses a trend card to stat tiles. */
public enum BucketSize {
    NONE,
    MONTH,
    /** Indian financial-year quarters: Apr–Jun is Q1. */
    QUARTER,
    /** Indian financial years, 1 April to 31 March. */
    YEAR
}
