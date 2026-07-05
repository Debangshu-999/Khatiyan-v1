package com.khatiyan.d_modules.billing.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.BillingCycleStatus;

/**
 * Forward-looking generation schedule entry for one active monthly tenancy.
 *
 * <p>
 * The next cycle is not a stored row yet — it always starts one month after
 * the latest cycle's period start (mirrors the monthly generation scheduler),
 * so this response is derived from the latest existing cycle.
 */
public record UpcomingBillingCycleResponse(
        UUID tenancyId,
        String tenancyReferenceCode,
        UUID tenantUserId,
        String tenantName,
        UUID roomId,
        String roomNumber,
        int currentCycleNumber,
        LocalDate currentPeriodStartDate,
        LocalDate currentPeriodEndDate,
        BillingCycleStatus currentCycleStatus,
        long baseAmountPaise,
        LocalDate nextCycleStartDate,
        LocalDate tenancyEndDate
) {
}
