package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealStatus;
import com.khatiyan.d_modules.property.model.MealType;

class MealAttendanceWindowTest {

    private static MealSlot slot(LocalTime start, LocalTime end, LocalTime now) {
        MealStatus status = now.isBefore(start)
                ? MealStatus.UPCOMING
                : now.isBefore(end) ? MealStatus.SERVING : MealStatus.DONE;
        return new MealSlot(MealType.LUNCH, start, end, 0, status);
    }

    private static boolean open(LocalTime now) {
        return MealScheduleRules.attendanceOpen(slot(LocalTime.of(12, 30), LocalTime.of(14, 30), now), now);
    }

    @Test
    void closedBeforeTheMealStarts() {
        assertThat(open(LocalTime.of(12, 29))).isFalse();
    }

    @Test
    void openFromTheStartThroughTheMeal() {
        assertThat(open(LocalTime.of(12, 30))).isTrue();
        assertThat(open(LocalTime.of(14, 29))).isTrue();
    }

    @Test
    void openForTenMinutesAfterTheEndForWhoeverIsStillInLine() {
        assertThat(open(LocalTime.of(14, 30))).isTrue();
        assertThat(open(LocalTime.of(14, 39))).isTrue();
        assertThat(open(LocalTime.of(14, 40))).isFalse();
    }

    @Test
    void aMealEndingJustBeforeMidnightDoesNotWrap() {
        LocalTime start = LocalTime.of(22, 0);
        LocalTime end = LocalTime.of(23, 55);
        LocalTime afterMidnight = LocalTime.of(0, 2);
        assertThat(MealScheduleRules.attendanceOpen(slot(start, end, afterMidnight), afterMidnight)).isFalse();
        LocalTime inTheGrace = LocalTime.of(23, 59);
        assertThat(MealScheduleRules.attendanceOpen(slot(start, end, inTheGrace), inTheGrace)).isTrue();
    }
}
