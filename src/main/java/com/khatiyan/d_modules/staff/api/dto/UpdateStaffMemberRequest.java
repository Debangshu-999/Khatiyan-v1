package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateStaffMemberRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 120) String fullName,
        LocalDate dateOfBirth,
        @NotNull IdentityVerificationStatus identityVerificationStatus,
        @NotNull SalaryStructure salaryStructure,
        @Positive long salaryRatePaise,
        // Weekday mask for daily staff (Mon=bit0..Sun=bit6). Null/ignored for
        // monthly staff; null for daily defaults to all seven days.
        Integer workingDaysMask,
        @Size(max = 2_000) String benefitsSummary,
        @NotNull LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        @Size(max = 2_000) String employmentNotes) {
}
