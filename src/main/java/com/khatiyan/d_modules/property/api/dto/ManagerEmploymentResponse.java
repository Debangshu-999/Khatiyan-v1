package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.d_modules.property.model.PropertyManager;

/**
 * A manager's employment terms, owned by the property module (the
 * {@code property_managers} row owns both the access assignment and the
 * employment snapshot). Surfaced to the staff workspace through the facade.
 */
public record ManagerEmploymentResponse(
    UUID id,
    String referenceCode,
    UUID managerUserId,
    String fullName,
    String phone,
    Integer age,
    LocalDate dateOfBirth,
    IdentityVerificationStatus identityVerificationStatus,
    SalaryStructure salaryStructure,
    long salaryRatePaise,
    String benefitsSummary,
    LocalDate employmentStartDate,
    LocalDate employmentEndDate,
    String employmentNotes,
    String employmentEndReason,
    String employmentReview,
    Instant createdAt,
    Instant updatedAt,
    boolean active
) {

    public static ManagerEmploymentResponse from(PropertyManager manager, String fullName, String phone, Integer age) {
        return new ManagerEmploymentResponse(
            manager.getId(),
            manager.getReferenceCode(),
            manager.getManagerUserId(),
            fullName,
            phone,
            age,
            manager.getDateOfBirth(),
            manager.getIdentityVerificationStatus(),
            manager.getSalaryStructure(),
            manager.getSalaryRatePaise(),
            manager.getBenefitsSummary(),
            manager.getEmploymentStartDate(),
            manager.getEmploymentEndDate(),
            manager.getEmploymentNotes(),
            manager.getEmploymentEndReason(),
            manager.getEmploymentReview(),
            manager.getCreatedAt(),
            manager.getUpdatedAt(),
            manager.isCurrentlyActive()
        );
    }
}
