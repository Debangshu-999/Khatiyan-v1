package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

/**
 * Raised when an owner or manager records a payment against a billing cycle by
 * hand — cash taken at the desk, a UPI transfer they saw land, a cheque.
 *
 * <p>Every payment in the app is manual: online collection is parked, so this is
 * the only way a bill is ever settled. It therefore has to reach the activity
 * feed and the tenant's notifications, or the two things an owner checks after
 * taking money both stay silent.
 */
public record BillingCyclePaidManuallyEvent(
        UUID manualPaymentId,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        String tenantNameSnapshot,
        long amountPaise,
        ManualPaymentMethod method,
        UUID recordedByUserId) {
}
