package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;

/**
 * Tenant/admin visible line item inside a live billing cycle.
 */
public record BillingCycleLineItemResponse(
    UUID id,
    UUID billingCycleId,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    BillingCycleLineItemType type,
    BillingCycleLineItemStatus status,
    String label,
    String description,
    long amountPaise,
    long settlementAmountPaise,
    BillingLineSettlementAction settlementAction,
    boolean systemGenerated,
    UUID createdByUserId,
    /**
     * Display name of whoever added the line, when it can be resolved.
     *
     * <p>Null on system lines, and null on read paths that do not resolve names
     * — a caller must treat it as "unknown", never as "nobody".
     */
    String createdByName,
    UUID lastAdjustedByUserId,
    int displayOrder,
    Instant createdAt,
    Instant updatedAt
) {
    public static BillingCycleLineItemResponse from(BillingCycleLineItem lineItem) {
        return from(lineItem, null);
    }

    public static BillingCycleLineItemResponse from(BillingCycleLineItem lineItem, String createdByName) {
        return new BillingCycleLineItemResponse(
            lineItem.getId(),
            lineItem.getBillingCycleId(),
            lineItem.getTenancyId(),
            lineItem.getTenantUserId(),
            lineItem.getPropertyId(),
            lineItem.getType(),
            lineItem.getStatus(),
            lineItem.getLabel(),
            lineItem.getDescription(),
            lineItem.getAmountPaise(),
            lineItem.getSettlementAmountPaise(),
            lineItem.getSettlementAction(),
            lineItem.isSystemGenerated(),
            lineItem.getCreatedByUserId(),
            createdByName,
            lineItem.getLastAdjustedByUserId(),
            lineItem.getDisplayOrder(),
            lineItem.getCreatedAt(),
            lineItem.getUpdatedAt()
        );
    }
}
