package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;

/**
 * Raised after a tenant-visible billing line is created or changed.
 */
public record BillingLineItemNotificationEvent(
        UUID lineItemId,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        BillingCycleLineItemType type,
        BillingCycleLineItemStatus status,
        BillingLineSettlementAction settlementAction,
        String label,
        long amountPaise,
        long settlementAmountPaise,
        BillingLineItemNotificationAction action) {

    public static BillingLineItemNotificationEvent from(
            BillingCycleLineItem lineItem,
            BillingLineItemNotificationAction action) {
        return new BillingLineItemNotificationEvent(
                lineItem.getId(),
                lineItem.getBillingCycleId(),
                lineItem.getTenancyId(),
                lineItem.getTenantUserId(),
                lineItem.getPropertyId(),
                lineItem.getType(),
                lineItem.getStatus(),
                lineItem.getSettlementAction(),
                lineItem.getLabel(),
                lineItem.getAmountPaise(),
                lineItem.getSettlementAmountPaise(),
                action);
    }
}
