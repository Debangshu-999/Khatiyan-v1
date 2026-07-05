package com.khatiyan.d_modules.staff.api.dto;

import java.time.LocalDate;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.d_modules.staff.model.StaffMember;

public record StaffMemberResponse(
        String referenceCode,
        String categoryName,
        String fullName,
        Integer age,
        LocalDate dateOfBirth,
        IdentityVerificationStatus identityVerificationStatus,
        SalaryStructure salaryStructure,
        long salaryRatePaise,
        int workingDaysMask,
        String benefitsSummary,
        LocalDate employmentStartDate,
        LocalDate employmentEndDate,
        String employmentNotes,
        boolean active) {

    public static StaffMemberResponse from(StaffMember member, String categoryName, Integer age) {
        return new StaffMemberResponse(
                member.getReferenceCode(),
                categoryName,
                member.getFullName(),
                age,
                member.getDateOfBirth(),
                member.getIdentityVerificationStatus(),
                member.getSalaryStructure(),
                member.getSalaryRatePaise(),
                member.getWorkingDaysMask(),
                member.getBenefitsSummary(),
                member.getEmploymentStartDate(),
                member.getEmploymentEndDate(),
                member.getEmploymentNotes(),
                member.isActive());
    }
}
