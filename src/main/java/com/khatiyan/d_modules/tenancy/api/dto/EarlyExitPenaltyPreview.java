package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.EarlyExitPenaltyType;

/**
 * What an agreement tenant would owe as an early-exit penalty for a chosen
 * checkout date, shown before they raise the exit request.
 */
public record EarlyExitPenaltyPreview(
        UUID tenancyId,
        LocalDate checkoutDate,
        LocalDate lockInEndDate,
        boolean withinLockIn,
        EarlyExitPenaltyType penaltyType,
        long penaltyPaise) {
}
