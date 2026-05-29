package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * Response for a live billing cycle and its current line-item breakdown.
 */
public record BillingCycleResponse(
    UUID id,
    UUID tenancyId,
    UUID tenantUserId,
    String tenantNameSnapshot,
    UUID propertyId,
    UUID roomId,
    TenancyBillingType billingType,
    int cycleNumber,
    LocalDate periodStartDate,
    LocalDate periodEndDate,
    LocalDate rentDueDate,
    BillingCollectionTiming billingCollectionTiming,
    int rentGraceDays,
    long baseAmountPaise,
    long extraChargePaise,
    long lateFeeAmountPaise,
    long discountAmountPaise,
    long totalAmountPaise,
    BillingCycleStatus status,
    Instant paidAt,
    Instant createdAt,
    Instant updatedAt,
    List<BillingCycleLineItemResponse> lineItems
) {
    public static BillingCycleResponse from(
            BillingCycle cycle,
            List<BillingCycleLineItemResponse> lineItems) {
        return new BillingCycleResponse(
            cycle.getId(),
            cycle.getTenancyId(),
            cycle.getTenantUserId(),
            cycle.getTenantNameSnapshot(),
            cycle.getPropertyId(),
            cycle.getRoomId(),
            cycle.getBillingType(),
            cycle.getCycleNumber(),
            cycle.getPeriodStartDate(),
            cycle.getPeriodEndDate(),
            cycle.getRentDueDate(),
            cycle.getBillingCollectionTiming(),
            cycle.getRentGraceDays(),
            cycle.getBaseAmountPaise(),
            cycle.getExtraChargePaise(),
            cycle.getLateFeeAmountPaise(),
            cycle.getDiscountAmountPaise(),
            cycle.getTotalAmountPaise(),
            cycle.getStatus(),
            cycle.getPaidAt(),
            cycle.getCreatedAt(),
            cycle.getUpdatedAt(),
            lineItems
        );
    }
}
