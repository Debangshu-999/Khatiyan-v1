package com.khatiyan.d_modules.analytics.period;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * A picked period turned into exact dates.
 *
 * @param comparison the window this one is compared with, or null when there is
 *                   none: All time, or a window that would start before the
 *                   property joined Khatiyan
 */
public record ResolvedPeriod(
        PeriodPreset preset,
        DateRange range,
        DateRange comparison,
        BucketSize bucket,
        LocalDate dataSince) {

    public boolean hasComparison() {
        return comparison != null;
    }

    /** The range split into this period's buckets, the first and last clipped to the range. */
    public List<DateRange> buckets() {
        return switch (bucket) {
            case NONE -> List.of(range);
            case MONTH -> split(day -> day.withDayOfMonth(1), day -> day.plusMonths(1));
            case QUARTER -> split(ResolvedPeriod::quarterStart, day -> day.plusMonths(3));
            case YEAR -> split(AnalyticsPeriodResolver::financialYearStart, day -> day.plusYears(1));
        };
    }

    private List<DateRange> split(UnaryOperator<LocalDate> startOf, UnaryOperator<LocalDate> next) {
        List<DateRange> buckets = new ArrayList<>();
        LocalDate start = startOf.apply(range.from());
        while (!start.isAfter(range.to())) {
            LocalDate end = next.apply(start).minusDays(1);
            buckets.add(new DateRange(
                    start.isBefore(range.from()) ? range.from() : start,
                    end.isAfter(range.to()) ? range.to() : end));
            start = next.apply(start);
        }
        return buckets;
    }

    private static LocalDate quarterStart(LocalDate day) {
        LocalDate yearStart = AnalyticsPeriodResolver.financialYearStart(day);
        long monthsIn = ChronoUnit.MONTHS.between(YearMonth.from(yearStart), YearMonth.from(day));
        return yearStart.plusMonths((monthsIn / 3) * 3);
    }
}
