package com.khatiyan.d_modules.analytics.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.FieldValidationException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;

class AnalyticsRequestParserTest {

    @Test
    void divisionsComeFromTheLowercasePathAndUnknownOnesAre404() {
        assertThat(AnalyticsRequestParser.division("billing")).isEqualTo(AnalyticsDivision.BILLING);
        assertThatThrownBy(() -> AnalyticsRequestParser.division("leads")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void aMissingPeriodMeansTheLastThreeMonthsAndAnUnknownOneIsAFieldError() {
        assertThat(AnalyticsRequestParser.preset(null)).isEqualTo(PeriodPreset.LAST_3_MONTHS);
        assertThat(AnalyticsRequestParser.preset("current_fy")).isEqualTo(PeriodPreset.CURRENT_FY);
        assertThatThrownBy(() -> AnalyticsRequestParser.preset("LAST_FY")).isInstanceOf(FieldValidationException.class);
    }

    @Test
    void datesAreIsoAndABadOneNamesItsField() {
        assertThat(AnalyticsRequestParser.date("from", "2026-07-01")).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(AnalyticsRequestParser.date("from", " ")).isNull();
        assertThatThrownBy(() -> AnalyticsRequestParser.date("to", "01/07/2026"))
                .isInstanceOfSatisfying(FieldValidationException.class,
                        e -> assertThat(e.getFieldErrors().get(0).field()).isEqualTo("to"));
    }
}
