package com.khatiyan.d_modules.property.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.d_modules.property.model.PropertyManager;

/**
 * Minimal manager payroll terms for scheduled jobs (e.g. the salary-account
 * roll-over cron). Deliberately omits user-profile fields so it can be built
 * straight from the {@code property_managers} row without per-manager lookups.
 */
public record ManagerPayrollView(
    UUID id,
    UUID propertyId,
    SalaryStructure salaryStructure,
    long salaryRatePaise,
    LocalDate employmentStartDate,
    LocalDate employmentEndDate
) {

    public static ManagerPayrollView from(PropertyManager manager) {
        return new ManagerPayrollView(
            manager.getId(),
            manager.getPropertyId(),
            manager.getSalaryStructure(),
            manager.getSalaryRatePaise(),
            manager.getEmploymentStartDate(),
            manager.getEmploymentEndDate());
    }
}
