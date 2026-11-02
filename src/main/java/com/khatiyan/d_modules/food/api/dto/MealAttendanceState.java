package com.khatiyan.d_modules.food.api.dto;

/** Where one meal stands for attendance. */
public enum MealAttendanceState {
    UPCOMING,
    /** The meal is on, or still inside the ten minutes after it for whoever is in line. */
    OPEN,
    DONE
}
