package com.khatiyan.d_modules.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.dashboard.api.dto.ActivityDayBucket;

/**
 * Day grouping for the activity feed.
 *
 * <p>
 * The interesting cases are all about zone and week boundaries: buckets are the
 * owner's IST day, and "this week" is a calendar week rather than a rolling
 * seven days.
 */
class ActivityDayBucketTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static Instant istInstant(LocalDate date, int hour, int minute) {
        return date.atTime(LocalTime.of(hour, minute)).atZone(IST).toInstant();
    }

    @Test
    void groupsByTheOwnersIstDayNotUtc() {
        LocalDate today = LocalDate.of(2026, 8, 5); // a Wednesday
        // 00:30 IST on the 5th is still 19:00 UTC on the 4th — bucketing on UTC
        // would call this yesterday.
        Instant justAfterIstMidnight = istInstant(today, 0, 30);

        assertThat(ActivityEventService.bucketFor(justAfterIstMidnight, today))
                .isEqualTo(ActivityDayBucket.TODAY);
    }

    @Test
    void separatesYesterdayFromEarlierThisWeek() {
        LocalDate today = LocalDate.of(2026, 8, 5); // Wednesday

        assertThat(ActivityEventService.bucketFor(istInstant(today.minusDays(1), 12, 0), today))
                .isEqualTo(ActivityDayBucket.YESTERDAY);
        assertThat(ActivityEventService.bucketFor(istInstant(today.minusDays(2), 12, 0), today))
                .isEqualTo(ActivityDayBucket.EARLIER_THIS_WEEK);
    }

    @Test
    void everythingOlderThanYesterdayIsEarlierThisWeek() {
        LocalDate wednesday = LocalDate.of(2026, 8, 5);

        // The window is a rolling 7 days, not a calendar week, so crossing back
        // over Monday changes nothing — the purge job is what bounds it.
        assertThat(ActivityEventService.bucketFor(istInstant(LocalDate.of(2026, 8, 3), 9, 0), wednesday))
                .isEqualTo(ActivityDayBucket.EARLIER_THIS_WEEK);
        assertThat(ActivityEventService.bucketFor(istInstant(LocalDate.of(2026, 8, 2), 23, 0), wednesday))
                .as("still inside the 7-day window even though it is the previous calendar week")
                .isEqualTo(ActivityDayBucket.EARLIER_THIS_WEEK);
    }

    @Test
    void aClockSkewedFutureEventStillReadsAsToday() {
        LocalDate today = LocalDate.of(2026, 8, 5);

        assertThat(ActivityEventService.bucketFor(istInstant(today.plusDays(1), 3, 0), today))
                .as("never leave an event unbucketed just because its timestamp runs ahead")
                .isEqualTo(ActivityDayBucket.TODAY);
    }
}
