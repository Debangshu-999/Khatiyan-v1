package com.khatiyan.d_modules.staff.api.dto;

/**
 * What the owner sees before confirming an employment end: whether a salary
 * account exists and how much is still owed across its open months.
 */
public record TerminationPreviewResponse(
    boolean hasSalaryAccount,
    long outstandingPaise,
    long grossToDatePaise,
    long paidToDatePaise
) {
}
