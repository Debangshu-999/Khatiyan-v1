package com.khatiyan.d_modules.property.api.dto;

import java.time.LocalDate;

import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** Request body used to assign a manager and create their employment record atomically. */
public record AddPropertyManagerRequest(
        @NotBlank @Size(max = 15) String phone,
        @NotBlank @Size(max = 120) String fullName,
        LocalDate dateOfBirth,
        @NotNull SalaryStructure salaryStructure,
        @Positive long salaryRatePaise,
        @Size(max = 2_000) String benefitsSummary,
        @NotNull LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        @Size(max = 2_000) String employmentNotes) {
}
