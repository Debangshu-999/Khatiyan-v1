package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateStaffMemberRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 120) String fullName,
        LocalDate dateOfBirth,
        @NotNull SalaryStructure salaryStructure,
        @Positive long salaryRatePaise,
        @Size(max = 2_000) String benefitsSummary,
        @NotNull LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        @Size(max = 2_000) String employmentNotes) {
}
