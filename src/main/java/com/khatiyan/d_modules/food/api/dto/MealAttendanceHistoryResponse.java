package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;


/**
 * Attendance going back day by day, newest first, to the first day anything
 * was recorded.
 */
public record MealAttendanceHistoryResponse(List<Day> days, boolean hasMore) {

    public record Day(LocalDate date, List<MealAttendanceDayResponse.Meal> meals) {
    }
}
