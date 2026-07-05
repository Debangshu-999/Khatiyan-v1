package com.khatiyan.d_modules.expense.event;

import java.util.UUID;

/**
 * Raised when the recurring default monthly budget is set or edited. The
 * {@code previousDefaultPaise} is null when the default is set for the first
 * time. The notification listener turns this into a management-facing alert.
 */
public record BudgetDefaultUpdatedEvent(
        UUID propertyId,
        Long previousDefaultPaise,
        long newDefaultPaise,
        UUID actorUserId) {
}
