package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/** A due configured exit failed safely and will be retried. */
public record ScheduledTenancyExitFailedEvent(
        UUID scheduleId,
        UUID exitRequestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        LocalDate checkoutDate,
        String failureCode,
        String failureMessage,
        int attemptCount) {
}
