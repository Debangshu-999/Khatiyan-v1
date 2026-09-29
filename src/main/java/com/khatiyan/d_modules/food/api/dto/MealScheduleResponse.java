package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.khatiyan.d_modules.food.service.MealScheduleRules.MealStatus;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * A property's meal day: the timetable, today's meals as they stand, and the
 * one meal that is next. Owner and tenant read the same shape.
 */
public record MealScheduleResponse(
        /** Today, in IST. */
        LocalDate date,
        /** The standing timetable, served meals only, in meal order. */
        List<MealTiming> timings,
        /** Today's meals with any delay applied and their status now. */
        List<MealSlot> today,
        /** Null once the day's last meal is over, until midnight. */
        MealSlot nextMeal,
        /** A meal can be delayed until this many minutes before it starts. */
        int delayCutoffMinutes
) {

    /** {@code saved} is false while the meal is still on the default time. */
    public record MealTiming(MealType mealType, LocalTime startTime, LocalTime endTime, boolean saved) {
    }

    public record MealSlot(
            MealType mealType,
            LocalTime startTime,
            LocalTime endTime,
            /** Minutes later than planned, 0 when on time. */
            int delayMinutes,
            MealStatus status) {
    }
}
