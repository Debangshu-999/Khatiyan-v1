package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.khatiyan.d_modules.tenancy.model.RollCallMethod;

/**
 * The tenant's roll call tonight (user, 2026-11-15).
 *
 * @param available  roll call is on at this property and this stay is on the roll
 * @param open       the window is open now, so marking is allowed
 * @param state      PRESENT, ABSENT, AWAY, AWAY_DECLARED (a stay out) or NOT_MARKED
 * @param method     how the mark was made, null when there is none
 */
public record RollCallTodayResponse(
        boolean available,
        boolean autoCheckIn,
        Integer windowStartMinute,
        Integer windowEndMinute,
        boolean open,
        LocalDate night,
        String state,
        RollCallMethod method,
        Instant markedAt) {
}
