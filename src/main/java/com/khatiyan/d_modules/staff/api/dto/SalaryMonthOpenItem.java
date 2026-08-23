package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * An open salary month for the current payroll month — a salary that is now
 * recordable, whether or not anything has been paid against it yet.
 *
 * <p>Distinct from {@link SalaryPaymentDueItem}, which is the same account seen
 * from the other end of the month: still unpaid, and running out of time. This
 * one announces that the month exists; that one chases it.
 *
 * @param firstMonthForAccount true when the account has no earlier payroll month
 *     — a new monthly employee joining payroll, rather than a returning one
 *     rolling into a new month. Worth announcing by name instead of folding into
 *     the property's monthly batch.
 */
public record SalaryMonthOpenItem(
    UUID propertyId,
    UUID accountId,
    String accountReferenceCode,
    String holderName,
    LocalDate payrollMonth,
    long netPaise,
    boolean firstMonthForAccount
) {
}
