package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A stay out as the tenant declares or changes it (user, 2026-11-08). No last
 * meal here = gone before the leaving day's first meal, no first meal back =
 * back after the return day's last. Meals are ignored where no food is served.
 */
public record SaveStayOutRequest(
        @NotNull(message = "Choose the day you leave.") LocalDate leaveDate,
        MealType lastMealHere,
        @NotNull(message = "Choose the day you are back.") LocalDate returnDate,
        MealType firstMealBack,
        @Size(max = 200, message = "Keep the reason under 200 characters.") String reason) {
}
