package com.khatiyan.d_modules.analytics.metric;

import java.time.LocalDate;
import java.util.Map;

/** One trend bucket: its dates and one value per series key. */
public record SeriesPoint(LocalDate from, LocalDate to, Map<String, Long> values) {}
