package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * Management's view of a property's stay outs (user, 2026-11-08): who is away
 * tonight, who is back today, who leaves in the next 30 days, and (2026-11-14)
 * who came back in the last 30, newest first.
 */
public record StayOutBoardResponse(
        List<Entry> awayTonight,
        List<Entry> backToday,
        List<Entry> upcoming,
        List<Entry> past) {

    public record Entry(
            UUID id,
            UUID tenancyId,
            /** The stay's short code (TEN-...), never the id on screen. */
            String tenancyReferenceCode,
            String tenantName,
            String roomNumber,
            LocalDate leaveDate,
            MealType lastMealHere,
            LocalDate returnDate,
            MealType firstMealBack,
            String reason) {
    }
}
