package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * A tenant declared, changed or cancelled a stay out (user, 2026-11-08).
 * Management is told. Carries the tenant's name, read when it happened.
 */
public record StayOutChangedEvent(
        Kind kind,
        UUID stayOutId,
        UUID tenancyId,
        /** TEN-..., for the notice's table: never the id. */
        String tenancyReferenceCode,
        UUID tenantUserId,
        String tenantName,
        UUID propertyId,
        LocalDate leaveDate,
        /** Null = gone before the leaving day's first meal. */
        MealType lastMealHere,
        LocalDate returnDate,
        /** Null = back after the return day's last meal. */
        MealType firstMealBack,
        String reason) {

    public enum Kind {
        DECLARED,
        CHANGED,
        CANCELLED
    }
}
