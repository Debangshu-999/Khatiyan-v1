package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A monthly salary account whose current-month salary is still unpaid. Used by
 * the end-of-month reminder scanner to nudge the owner to record the payment.
 */
public record SalaryPaymentDueItem(
    UUID propertyId,
    UUID accountId,
    String accountReferenceCode,
    String holderName,
    LocalDate payrollMonth,
    long outstandingPaise
) {
}
