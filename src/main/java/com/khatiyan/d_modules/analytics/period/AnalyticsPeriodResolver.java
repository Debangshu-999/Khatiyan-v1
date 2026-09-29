package com.khatiyan.d_modules.analytics.period;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import com.khatiyan.c_shared.exception.ErrorResponse;
import com.khatiyan.c_shared.exception.FieldValidationException;

/**
 * Turns a picked period into exact IST dates, spec §3.
 *
 * <p>Pure: "today" and the property's registration date are passed in, so every
 * rule here is testable without a clock or a database.
 */
public final class AnalyticsPeriodResolver {

    private static final DateTimeFormatter MESSAGE_DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private AnalyticsPeriodResolver() {
    }

    public static ResolvedPeriod resolve(
            PeriodPreset preset, LocalDate customFrom, LocalDate customTo, LocalDate today, LocalDate dataSince) {
        Objects.requireNonNull(preset, "preset");
        LocalDate monthStart = today.withDayOfMonth(1);

        DateRange raw = switch (preset) {
            case THIS_MONTH -> new DateRange(monthStart, today);
            case LAST_MONTH -> new DateRange(monthStart.minusMonths(1), monthStart.minusDays(1));
            case LAST_3_MONTHS -> new DateRange(monthStart.minusMonths(2), today);
            case LAST_6_MONTHS -> new DateRange(monthStart.minusMonths(5), today);
            case CURRENT_FY -> new DateRange(financialYearStart(today), today);
            case ALL_TIME -> new DateRange(dataSince.isAfter(today) ? today : dataSince, today);
            case CUSTOM -> validatedCustom(customFrom, customTo, today, dataSince);
        };

        DateRange range = clampToDataSince(raw, dataSince);
        DateRange comparison = comparisonFor(preset, raw, today);
        if (comparison != null && comparison.from().isBefore(dataSince)) {
            // Comparing with a window Khatiyan only half recorded would mislead.
            comparison = null;
        }
        return new ResolvedPeriod(preset, range, comparison, bucketFor(range), dataSince);
    }

    public static LocalDate financialYearStart(LocalDate day) {
        int year = day.getMonthValue() >= 4 ? day.getYear() : day.getYear() - 1;
        return LocalDate.of(year, 4, 1);
    }

    static BucketSize bucketFor(DateRange range) {
        YearMonth first = YearMonth.from(range.from());
        YearMonth last = YearMonth.from(range.to());
        if (first.equals(last)) {
            return BucketSize.NONE;
        }
        long months = ChronoUnit.MONTHS.between(first, last) + 1;
        if (months <= 12) {
            return BucketSize.MONTH;
        }
        return months <= 36 ? BucketSize.QUARTER : BucketSize.YEAR;
    }

    /**
     * Starts the range at registration when it began earlier. A range that
     * ended before registration is left alone: Khatiyan recorded nothing in it,
     * so every query comes back empty and every card says so.
     */
    private static DateRange clampToDataSince(DateRange raw, LocalDate dataSince) {
        if (!raw.from().isBefore(dataSince) || dataSince.isAfter(raw.to())) {
            return raw;
        }
        return new DateRange(dataSince, raw.to());
    }

    private static DateRange comparisonFor(PeriodPreset preset, DateRange raw, LocalDate today) {
        return switch (preset) {
            case THIS_MONTH -> {
                // The same days of last month: a month-to-date total against a
                // whole previous month would always read as a drop.
                LocalDate start = raw.from().minusMonths(1);
                LocalDate end = start.plusDays(today.getDayOfMonth() - 1L);
                LocalDate monthEnd = raw.from().minusDays(1);
                yield new DateRange(start, end.isAfter(monthEnd) ? monthEnd : end);
            }
            case LAST_MONTH -> new DateRange(raw.from().minusMonths(1), raw.from().minusDays(1));
            case LAST_3_MONTHS -> shiftedBack(raw, 3);
            case LAST_6_MONTHS -> shiftedBack(raw, 6);
            case CURRENT_FY -> shiftedBack(raw, 12);
            case CUSTOM -> new DateRange(raw.from().minusDays(raw.days()), raw.from().minusDays(1));
            case ALL_TIME -> null;
        };
    }

    private static DateRange shiftedBack(DateRange raw, int months) {
        return new DateRange(raw.from().minusMonths(months), raw.to().minusMonths(months));
    }

    private static DateRange validatedCustom(LocalDate from, LocalDate to, LocalDate today, LocalDate dataSince) {
        List<ErrorResponse.FieldError> errors = new ArrayList<>();
        if (from == null) {
            errors.add(new ErrorResponse.FieldError("from", "Pick a start date"));
        } else if (from.isBefore(dataSince)) {
            errors.add(new ErrorResponse.FieldError("from", "Pick a start date on or after " + MESSAGE_DATE.format(dataSince)));
        }
        if (to == null) {
            errors.add(new ErrorResponse.FieldError("to", "Pick an end date"));
        } else if (to.isAfter(today)) {
            errors.add(new ErrorResponse.FieldError("to", "Pick an end date no later than today"));
        } else if (from != null && from.isAfter(to)) {
            errors.add(new ErrorResponse.FieldError("to", "Pick an end date on or after the start date"));
        }
        if (!errors.isEmpty()) {
            throw new FieldValidationException(errors);
        }
        return new DateRange(from, to);
    }
}
