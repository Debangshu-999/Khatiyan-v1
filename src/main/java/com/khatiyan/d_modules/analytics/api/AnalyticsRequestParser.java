package com.khatiyan.d_modules.analytics.api;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;

import com.khatiyan.c_shared.exception.ErrorResponse;
import com.khatiyan.c_shared.exception.FieldValidationException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;

/**
 * Query parameters parsed by hand, so each failure names its field. Strings
 * rather than bound enums and dates: a binding failure is an unlabelled 400.
 */
final class AnalyticsRequestParser {

    private AnalyticsRequestParser() {
    }

    static AnalyticsDivision division(String path) {
        return AnalyticsDivision.fromPath(path).orElseThrow(() -> new NotFoundException("Analytics section", path));
    }

    static PeriodPreset preset(String value) {
        if (value == null || value.isBlank()) {
            return PeriodPreset.LAST_3_MONTHS;
        }
        try {
            return PeriodPreset.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new FieldValidationException(List.of(new ErrorResponse.FieldError("period", "Pick one of the listed periods")));
        }
    }

    static LocalDate date(String field, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new FieldValidationException(List.of(new ErrorResponse.FieldError(field, "Use a date like 2026-07-01")));
        }
    }
}
