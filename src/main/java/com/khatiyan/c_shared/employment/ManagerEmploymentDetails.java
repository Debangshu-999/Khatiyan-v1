package com.khatiyan.c_shared.employment;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Employment terms captured when an owner assigns a manager to a property.
 *
 * <p>The property-manager row owns both the access assignment and the manager's
 * employment snapshot, so assignment can be committed as one transaction.
 */
public record ManagerEmploymentDetails(
        LocalDate dateOfBirth,
        IdentityVerificationStatus identityVerificationStatus,
        Instant identityVerifiedAt,
        SalaryStructure salaryStructure,
        long salaryRatePaise,
        String benefitsSummary,
        LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        String employmentNotes) {
}
