package com.khatiyan.d_modules.billing.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Raised when a tenant payable cycle is generated.
 */
public record BillingCycleGeneratedEvent(
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        // Null for one-off bills (e.g. an early-exit penalty) that sit outside the
        // numbered rent-cycle sequence.
        Integer cycleNumber,
        LocalDate rentDueDate,
        long totalAmountPaise) {
}
