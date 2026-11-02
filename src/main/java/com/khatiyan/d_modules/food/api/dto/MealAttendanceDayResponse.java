package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;

import com.khatiyan.d_modules.property.model.MealType;

/** One day's attendance, meal by meal. */
public record MealAttendanceDayResponse(LocalDate date, boolean attendanceEnabled, List<Meal> meals) {

    public record Meal(
            MealType mealType,
            MealAttendanceState state,
            /** At least one scan. A meal nobody scanned was not recorded: it does not mean everybody skipped. */
            boolean recorded,
            long attended,
            long expected,
            /** Counted once the meal is over and only if it was recorded. Zero otherwise. */
            long skipped,
            /** When it is served, such as "1:00 PM to 3:00 PM". Today's meals only: the timetable may have moved since. */
            String time) {
    }
}
