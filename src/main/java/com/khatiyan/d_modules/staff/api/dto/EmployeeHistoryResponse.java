package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;

/**
 * A past employee (ended staff member or removed manager) for the history view.
 */
public record EmployeeHistoryResponse(
    SalaryHolderType holderType,
    String referenceCode,
    String fullName,
    String categoryName,
    IdentityVerificationStatus identityVerificationStatus,
    SalaryStructure salaryStructure,
    long salaryRatePaise,
    LocalDate employmentStartDate,
    LocalDate employmentEndDate,
    String employmentEndReason,
    String employmentReview,
    LocalDate settledOn,
    long settlementAmountPaise,
    long totalPaidPaise
) {
}
