package com.khatiyan.d_modules.analytics.metric;

import java.util.List;

/** Builds one division's metrics. One Spring bean per division. */
public interface DivisionAssembler {

    AnalyticsDivision division();

    List<MetricResult> assemble(AnalyticsContext context);
}
