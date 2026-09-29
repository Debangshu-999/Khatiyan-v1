package com.khatiyan.d_modules.analytics.api;

import java.util.List;

import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.MetricResult;

public record AnalyticsResponse(AnalyticsDivision division, PeriodResponse period, List<MetricResult> metrics) {}
