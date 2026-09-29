package com.khatiyan.d_modules.analytics.period;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ErrorResponse;
import com.khatiyan.c_shared.exception.FieldValidationException;

class AnalyticsPeriodResolverTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private static final LocalDate JOINED = LocalDate.of(2026, 1, 14);
    private static final LocalDate LONG_AGO = LocalDate.of(2020, 1, 1);

    private static DateRange range(String from, String to) {
        return new DateRange(LocalDate.parse(from), LocalDate.parse(to));
    }

    private static ResolvedPeriod resolve(PeriodPreset preset, LocalDate since) {
        return AnalyticsPeriodResolver.resolve(preset, null, null, TODAY, since);
    }

    private static ResolvedPeriod custom(String from, String to) {
        return AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM, LocalDate.parse(from), LocalDate.parse(to), TODAY, LONG_AGO);
    }

    @Test
    void thisMonthRunsToTodayAndComparesTheSameDaysLastMonth() {
        ResolvedPeriod p = resolve(PeriodPreset.THIS_MONTH, JOINED);
        assertThat(p.range()).isEqualTo(range("2026-09-01", "2026-09-26"));
        assertThat(p.comparison()).isEqualTo(range("2026-08-01", "2026-08-26"));
        assertThat(p.bucket()).isEqualTo(BucketSize.NONE);
    }

    @Test
    void thisMonthOnThe31stClampsTheComparisonToAShortMonth() {
        ResolvedPeriod p = AnalyticsPeriodResolver.resolve(PeriodPreset.THIS_MONTH, null, null, LocalDate.of(2026, 3, 31), LONG_AGO);
        assertThat(p.comparison()).isEqualTo(range("2026-02-01", "2026-02-28"));
    }

    @Test
    void lastMonthIsTheWholePreviousMonth() {
        ResolvedPeriod p = resolve(PeriodPreset.LAST_MONTH, JOINED);
        assertThat(p.range()).isEqualTo(range("2026-08-01", "2026-08-31"));
        assertThat(p.comparison()).isEqualTo(range("2026-07-01", "2026-07-31"));
        assertThat(p.bucket()).isEqualTo(BucketSize.NONE);
    }

    @Test
    void lastThreeMonthsShiftsBothEndsBackThreeMonths() {
        ResolvedPeriod p = resolve(PeriodPreset.LAST_3_MONTHS, JOINED);
        assertThat(p.range()).isEqualTo(range("2026-07-01", "2026-09-26"));
        assertThat(p.comparison()).isEqualTo(range("2026-04-01", "2026-06-26"));
        assertThat(p.bucket()).isEqualTo(BucketSize.MONTH);
        assertThat(p.buckets()).containsExactly(
                range("2026-07-01", "2026-07-31"),
                range("2026-08-01", "2026-08-31"),
                range("2026-09-01", "2026-09-26"));
    }

    @Test
    void aComparisonThatStartsBeforeRegistrationIsDropped() {
        assertThat(resolve(PeriodPreset.LAST_6_MONTHS, JOINED).comparison()).isNull();
        assertThat(resolve(PeriodPreset.LAST_6_MONTHS, LONG_AGO).comparison())
                .isEqualTo(range("2025-10-01", "2026-03-26"));
    }

    @Test
    void currentFinancialYearStartsOnTheFirstOfApril() {
        ResolvedPeriod p = resolve(PeriodPreset.CURRENT_FY, LONG_AGO);
        assertThat(p.range()).isEqualTo(range("2026-04-01", "2026-09-26"));
        assertThat(p.comparison()).isEqualTo(range("2025-04-01", "2025-09-26"));
        assertThat(AnalyticsPeriodResolver.financialYearStart(LocalDate.of(2026, 2, 10)))
                .isEqualTo(LocalDate.of(2025, 4, 1));
    }

    @Test
    void allTimeStartsAtRegistrationWithNoComparison() {
        ResolvedPeriod p = resolve(PeriodPreset.ALL_TIME, JOINED);
        assertThat(p.range()).isEqualTo(range("2026-01-14", "2026-09-26"));
        assertThat(p.comparison()).isNull();
        assertThat(p.bucket()).isEqualTo(BucketSize.MONTH);
    }

    @Test
    void allTimeOverThirteenToThirtySixMonthsUsesFinancialYearQuarters() {
        ResolvedPeriod p = resolve(PeriodPreset.ALL_TIME, LocalDate.of(2024, 1, 14));
        assertThat(p.bucket()).isEqualTo(BucketSize.QUARTER);
        assertThat(p.buckets()).startsWith(
                range("2024-01-14", "2024-03-31"),
                range("2024-04-01", "2024-06-30"));
        assertThat(p.buckets()).endsWith(range("2026-07-01", "2026-09-26"));
    }

    @Test
    void allTimeOverThirtySixMonthsUsesFinancialYears() {
        ResolvedPeriod p = resolve(PeriodPreset.ALL_TIME, LocalDate.of(2022, 6, 1));
        assertThat(p.bucket()).isEqualTo(BucketSize.YEAR);
        assertThat(p.buckets()).first().isEqualTo(range("2022-06-01", "2023-03-31"));
        assertThat(p.buckets()).last().isEqualTo(range("2026-04-01", "2026-09-26"));
    }

    @Test
    void aRangePartlyBeforeRegistrationStartsAtRegistration() {
        ResolvedPeriod p = resolve(PeriodPreset.LAST_3_MONTHS, LocalDate.of(2026, 8, 10));
        assertThat(p.range()).isEqualTo(range("2026-08-10", "2026-09-26"));
        assertThat(p.comparison()).isNull();
    }

    @Test
    void aRangeWhollyBeforeRegistrationIsLeftAloneAndComesBackEmpty() {
        ResolvedPeriod p = resolve(PeriodPreset.LAST_MONTH, LocalDate.of(2026, 9, 5));
        assertThat(p.range()).isEqualTo(range("2026-08-01", "2026-08-31"));
        assertThat(p.comparison()).isNull();
    }

    @Test
    void customComparesTheEqualSpanJustBefore() {
        ResolvedPeriod p = AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM,
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 8, 15), TODAY, JOINED);
        assertThat(p.range()).isEqualTo(range("2026-07-01", "2026-08-15"));
        assertThat(p.comparison()).isEqualTo(range("2026-05-16", "2026-06-30"));
        assertThat(p.buckets()).containsExactly(range("2026-07-01", "2026-07-31"), range("2026-08-01", "2026-08-15"));
    }

    @Test
    void customInsideOneMonthCollapses() {
        ResolvedPeriod p = AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM,
                LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 20), TODAY, JOINED);
        assertThat(p.bucket()).isEqualTo(BucketSize.NONE);
    }

    @Test
    void bucketThresholdsSitAtTwelveAndThirtySixMonths() {
        assertThat(custom("2024-01-01", "2024-12-31").bucket()).isEqualTo(BucketSize.MONTH);
        assertThat(custom("2024-01-01", "2025-01-01").bucket()).isEqualTo(BucketSize.QUARTER);
        assertThat(custom("2023-01-01", "2025-12-31").bucket()).isEqualTo(BucketSize.QUARTER);
        assertThat(custom("2022-12-01", "2025-12-31").bucket()).isEqualTo(BucketSize.YEAR);
    }

    @Test
    void customRangeErrorsNameTheirField() {
        assertThatThrownBy(() -> AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM, null, null, TODAY, JOINED))
                .isInstanceOfSatisfying(FieldValidationException.class, e -> assertThat(e.getFieldErrors())
                        .extracting(ErrorResponse.FieldError::field).containsExactly("from", "to"));

        assertThatThrownBy(() -> AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30), TODAY, JOINED))
                .isInstanceOfSatisfying(FieldValidationException.class, e -> assertThat(e.getFieldErrors())
                        .containsExactly(
                                new ErrorResponse.FieldError("from", "Pick a start date on or after 14 Jan 2026"),
                                new ErrorResponse.FieldError("to", "Pick an end date no later than today")));

        assertThatThrownBy(() -> AnalyticsPeriodResolver.resolve(PeriodPreset.CUSTOM,
                LocalDate.of(2026, 8, 20), LocalDate.of(2026, 8, 3), TODAY, JOINED))
                .isInstanceOfSatisfying(FieldValidationException.class, e -> assertThat(e.getFieldErrors())
                        .containsExactly(new ErrorResponse.FieldError("to", "Pick an end date on or after the start date")));
    }
}
