package com.khatiyan.d_modules.payment.provider;

import java.util.UUID;

/**
 * Provider-neutral request to create a checkout order.
 *
 * <p>The internal payment service builds this from a billing cycle. The
 * provider implementation translates it into gateway-specific API fields.
 */
public record CreateProviderPaymentOrderCommand(
        UUID paymentOrderId,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long amountPaise,
        String currency,
        String receiptReference,
        String description
) {
}
