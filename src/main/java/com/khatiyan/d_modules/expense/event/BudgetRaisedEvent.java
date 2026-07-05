package com.khatiyan.d_modules.expense.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Raised when a one-off monthly budget raise is recorded for a property. The
 * notification listener turns this into a management-facing budget alert.
 */
public record BudgetRaisedEvent(
        UUID propertyId,
        LocalDate month,
        long raiseAmountPaise,
        long effectiveBudgetPaise,
        String reason,
        UUID actorUserId) {
}
