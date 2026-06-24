package com.khatiyan.d_modules.staff.api.dto;

import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.d_modules.staff.model.StaffMember;

/**
 * Redacted staff member view for managers. Deliberately omits the employment
 * record (salary, dates, benefits, notes) — managers may see who works here,
 * not their pay terms.
 */
public record StaffMemberSummary(
        String referenceCode,
        String fullName,
        String categoryName,
        IdentityVerificationStatus identityVerificationStatus,
        boolean active) {

    public static StaffMemberSummary from(StaffMember member, String categoryName) {
        return new StaffMemberSummary(
                member.getReferenceCode(),
                member.getFullName(),
                categoryName,
                member.getIdentityVerificationStatus(),
                member.isActive());
    }
}
