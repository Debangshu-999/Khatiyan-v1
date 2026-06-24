package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateManagerEmploymentRequest(
        LocalDate dateOfBirth,
        @NotNull IdentityVerificationStatus identityVerificationStatus,
        @NotNull SalaryStructure salaryStructure,
        @PositiveOrZero long salaryRatePaise,
        @Size(max = 2_000) String benefitsSummary,
        LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        @Size(max = 2_000) String employmentNotes) {
}
