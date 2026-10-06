package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A visit has to take place inside its enquiry's 30 days (user, 2026-10-07):
 * the day strip stops at the enquiry's end, and a slot starting at or after it
 * is refused, booked or moved.
 */
class VisitEnquiryWindowTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static Instant ist(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(IST).toInstant();
    }

    @Test
    void aSlotWithNoEnquiryLimitIsAlwaysWithinIt() {
        assertThat(LeadVisitService.startsBefore(LocalDate.of(2026, 12, 1), LocalTime.of(10, 0), null)).isTrue();
    }

    @Test
    void aSlotStartingBeforeTheEnquiryEndsIsWithinIt() {
        LocalDate day = LocalDate.of(2026, 11, 5);
        Instant ends = ist(day, LocalTime.of(14, 30));

        assertThat(LeadVisitService.startsBefore(day, LocalTime.of(14, 29), ends)).isTrue();
        assertThat(LeadVisitService.startsBefore(day.minusDays(1), LocalTime.of(18, 0), ends)).isTrue();
    }

    @Test
    void aSlotStartingWhenOrAfterTheEnquiryEndsIsNot() {
        LocalDate day = LocalDate.of(2026, 11, 5);
        Instant ends = ist(day, LocalTime.of(14, 30));

        assertThat(LeadVisitService.startsBefore(day, LocalTime.of(14, 30), ends)).isFalse();
        assertThat(LeadVisitService.startsBefore(day, LocalTime.of(16, 0), ends)).isFalse();
        assertThat(LeadVisitService.startsBefore(day.plusDays(1), LocalTime.of(9, 0), ends)).isFalse();
    }

    @Test
    void theDayStripStopsOnTheEnquirysLastDayInIndia() {
        LocalDate lastDay = LocalDate.now(IST).plusDays(5);
        // 00:30 in India is still the previous evening in UTC: the day is India's.
        Instant ends = ist(lastDay, LocalTime.of(0, 30));

        assertThat(LeadVisitService.lastBookableDate(ends)).isEqualTo(lastDay);
    }

    @Test
    void theThirtyDayLimitStillAppliesWhenTheEnquiryEndsLater() {
        Instant farAway = ist(LocalDate.now(IST).plusDays(60), LocalTime.NOON);

        assertThat(LeadVisitService.lastBookableDate(farAway)).isEqualTo(LeadVisitService.lastBookableDate());
        assertThat(LeadVisitService.lastBookableDate(null)).isEqualTo(LeadVisitService.lastBookableDate());
    }

    @Test
    void aSlotPastTheEnquiryIsRefusedWithTheDayItEnds() {
        LocalDate day = LocalDate.of(2026, 11, 5);
        Instant ends = ist(day, LocalTime.of(14, 30));

        assertThatThrownBy(() -> LeadVisitService.requireWithinEnquiry(day, LocalTime.of(16, 0), ends))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("before this enquiry ends on 5 Nov");
        assertThatCode(() -> LeadVisitService.requireWithinEnquiry(day, LocalTime.of(11, 0), ends))
                .doesNotThrowAnyException();
        assertThatCode(() -> LeadVisitService.requireWithinEnquiry(day.plusDays(9), LocalTime.of(11, 0), null))
                .doesNotThrowAnyException();
    }
}
