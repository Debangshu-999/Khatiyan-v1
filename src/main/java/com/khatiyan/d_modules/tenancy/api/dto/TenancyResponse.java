package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

/**
 * Public-facing tenancy DTO. Used both by the REST controller
 * and by the {@link com.khatiyan.tenancy.TenancyModule} facade
 * when other modules ask for tenancy data.
 */
public record TenancyResponse(
    UUID id,
    UUID userId,
    UUID propertyId,
    UUID roomId,
    UUID createdByUserId,
    TenancyBillingType billingType,
    Long rentAmountPaise,
    Long depositAmountPaise,
    Long dailyRatePaise,
    LocalDate startDate,
    LocalDate plannedEndDate,
    LocalDate endDate,
    TenancyStatus status,
    Instant createdAt,
    boolean billingStarted
) {
    public static TenancyResponse from(Tenancy t) {
        return new TenancyResponse(
            t.getId(),
            t.getUserId(),
            t.getPropertyId(),
            t.getRoomId(),
            t.getCreatedByUserId(),
            t.getBillingType(),
            t.getRentAmountPaise(),
            t.getDepositAmountPaise(),
            t.getDailyRatePaise(),
            t.getStartDate(),
            t.getPlannedEndDate(),
            t.getEndDate(),
            t.getStatus(),
            t.getCreatedAt(),
            t.isBillingStarted()
        );
    }
}
