package com.khatiyan.d_modules.property.model;

import java.time.DayOfWeek;
import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One visit slot on one day of the week (2026-09-30). Slots are named Slot 1,
 * 2, 3 by their start time on the day, so the number is never stored.
 *
 * <p>Stored as minutes of the day, not TIME: the app writes TIME through
 * {@code hibernate.jdbc.time_zone=UTC}, which shifts it by the JVM's offset, so
 * the database's rules would judge the wrong clock. See V6176.
 */
@Embeddable
@Getter
@EqualsAndHashCode
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VisitSlot {

    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", nullable = false, length = 9)
    private DayOfWeek dayOfWeek;

    @Column(name = "start_minute", nullable = false)
    private int startMinute;

    @Column(name = "end_minute", nullable = false)
    private int endMinute;

    @Column(name = "visitors_per_slot", nullable = false)
    private int visitorsPerSlot;

    private VisitSlot(DayOfWeek dayOfWeek, int startMinute, int endMinute, int visitorsPerSlot) {
        this.dayOfWeek = dayOfWeek;
        this.startMinute = startMinute;
        this.endMinute = endMinute;
        this.visitorsPerSlot = visitorsPerSlot;
    }

    static VisitSlot on(DayOfWeek day, LocalTime startTime, LocalTime endTime, int visitorsPerSlot) {
        return new VisitSlot(day, minuteOfDay(startTime), minuteOfDay(endTime), visitorsPerSlot);
    }

    public LocalTime getStartTime() {
        return LocalTime.of(startMinute / 60, startMinute % 60);
    }

    public LocalTime getEndTime() {
        return LocalTime.of(endMinute / 60, endMinute % 60);
    }

    private static int minuteOfDay(LocalTime time) {
        return time.getHour() * 60 + time.getMinute();
    }
}
