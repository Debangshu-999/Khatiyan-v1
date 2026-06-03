package com.khatiyan.d_modules.payment.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.payment.model.PaymentOrder;
import com.khatiyan.d_modules.payment.model.PaymentOrderStatus;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * API response for an internal payment order.
 *
 * <p>The checkout fields are provider references. The frontend should still
 * treat webhook/backend verification as the final source of truth.
 */
public record PaymentOrderResponse(
        UUID id,
        String referenceCode,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long amountPaise,
        String currency,
        PaymentProviderType provider,
        String providerOrderId,
        String providerCheckoutReference,
        PaymentOrderStatus status,
        UUID createdByUserId,
        Instant expiresAt,
        Instant paidAt,
        Instant failedAt,
        String failureReason,
        Instant createdAt,
        Instant updatedAt) {

    public static PaymentOrderResponse from(PaymentOrder order) {
        return new PaymentOrderResponse(
                order.getId(),
                order.getReferenceCode(),
                order.getBillingCycleId(),
                order.getTenancyId(),
                order.getTenantUserId(),
                order.getPropertyId(),
                order.getAmountPaise(),
                order.getCurrency(),
                order.getProvider(),
                order.getProviderOrderId(),
                order.getProviderCheckoutReference(),
                order.getStatus(),
                order.getCreatedByUserId(),
                order.getExpiresAt(),
                order.getPaidAt(),
                order.getFailedAt(),
                order.getFailureReason(),
                order.getCreatedAt(),
                order.getUpdatedAt());
    }
}
