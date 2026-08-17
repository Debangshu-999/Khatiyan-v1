package com.khatiyan.d_modules.property.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class NoticePeriodTest {

    @ParameterizedTest(name = "{0} adds {1} extra cycle(s)")
    @CsvSource({
            "FIVE_DAYS,     0",
            "FIFTEEN_DAYS,  0",
            "ONE_MONTH,     0",
            "TWO_MONTHS,    1",
            "THREE_MONTHS,  2"})
    @DisplayName("one month is served by the cycle the request already sits in, so it adds nothing")
    void extraCyclesBeyondCurrent(NoticePeriod noticePeriod, int expected) {
        assertThat(noticePeriod.extraCyclesBeyondCurrent()).isEqualTo(expected);
    }

    @ParameterizedTest
    @EnumSource(NoticePeriod.class)
    @DisplayName("every option is either counted in days or in months, never both and never neither")
    void everyOptionIsExactlyOneKind(NoticePeriod noticePeriod) {
        boolean countsDays = noticePeriod.days() > 0;
        boolean countsMonths = noticePeriod.months() > 0;

        assertThat(countsDays ^ countsMonths)
                .as("%s: days=%d months=%d", noticePeriod, noticePeriod.days(), noticePeriod.months())
                .isTrue();
        assertThat(noticePeriod.isWholeMonths()).isEqualTo(countsMonths);
    }

    @ParameterizedTest(name = "legacy {0} days maps to {1}")
    @CsvSource({
            "5,   FIVE_DAYS",
            "15,  FIFTEEN_DAYS",
            "30,  ONE_MONTH",
            "60,  TWO_MONTHS",
            "90,  THREE_MONTHS",
            "365, THREE_MONTHS"})
    @DisplayName("the live data — 15 and 30 — migrates without loss")
    void legacyDayCountsMap(int legacyDays, NoticePeriod expected) {
        assertThat(NoticePeriod.fromLegacyDays(legacyDays)).isEqualTo(expected);
    }

    @Test
    @DisplayName("a missing legacy value takes the one-month default")
    void nullLegacyDefaultsToOneMonth() {
        assertThat(NoticePeriod.fromLegacyDays(null)).isEqualTo(NoticePeriod.ONE_MONTH);
    }

    @ParameterizedTest
    @EnumSource(NoticePeriod.class)
    @DisplayName("every option has a label an agreement clause can read")
    void everyOptionHasALabel(NoticePeriod noticePeriod) {
        assertThat(noticePeriod.label()).isNotBlank();
    }
}
