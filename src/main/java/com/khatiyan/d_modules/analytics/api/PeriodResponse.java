package com.khatiyan.d_modules.analytics.api;

import java.time.LocalDate;

import com.khatiyan.d_modules.analytics.period.BucketSize;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.analytics.period.ResolvedPeriod;

/** The period as the server resolved it. The app prints these dates rather than recomputing them. */
public record PeriodResponse(
        PeriodPreset preset,
        LocalDate from,
        LocalDate to,
        LocalDate compareFrom,
        LocalDate compareTo,
        BucketSize bucket,
        LocalDate dataSince) {

    public static PeriodResponse from(ResolvedPeriod period) {
        return new PeriodResponse(
                period.preset(),
                period.range().from(),
                period.range().to(),
                period.hasComparison() ? period.comparison().from() : null,
                period.hasComparison() ? period.comparison().to() : null,
                period.bucket(),
                period.dataSince());
    }
}
