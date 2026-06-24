package com.khatiyan.d_modules.staff.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Non-user personnel tracked for a property. */
@Entity
@Table(name = "staff_members", schema = "staff")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StaffMember extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, updatable = false)
    private String referenceCode;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(name = "identity_verification_status", nullable = false)
    private IdentityVerificationStatus identityVerificationStatus;

    @Column(name = "identity_verified_at")
    private Instant identityVerifiedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "salary_structure", nullable = false)
    private SalaryStructure salaryStructure;

    @Column(name = "salary_rate_paise", nullable = false)
    private long salaryRatePaise;

    @Column(name = "benefits_summary", nullable = false)
    private String benefitsSummary;

    @Column(name = "employment_start_date", nullable = false)
    private LocalDate employmentStartDate;

    @Column(name = "employment_end_date")
    private LocalDate employmentEndDate;

    @Column(name = "employment_notes", nullable = false)
    private String employmentNotes;

    @Column(name = "employment_end_reason", length = 500)
    private String employmentEndReason;

    @Column(name = "employment_review", length = 2000)
    private String employmentReview;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private StaffMember(
            String referenceCode, UUID propertyId, UUID categoryId, String fullName, LocalDate dateOfBirth, SalaryStructure salaryStructure, long salaryRatePaise,
            String benefitsSummary, LocalDate employmentStartDate, LocalDate employmentEndDate, String employmentNotes) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.propertyId = propertyId;
        this.categoryId = categoryId;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.identityVerificationStatus = IdentityVerificationStatus.NOT_STARTED;
        this.salaryStructure = salaryStructure;
        this.salaryRatePaise = salaryRatePaise;
        this.benefitsSummary = benefitsSummary;
        this.employmentStartDate = employmentStartDate;
        this.employmentEndDate = clampEndToToday(employmentEndDate);
        this.employmentNotes = employmentNotes;
        this.active = this.employmentEndDate == null;
    }

    public static StaffMember create(
            String referenceCode, UUID propertyId, UUID categoryId, String fullName, LocalDate dateOfBirth, SalaryStructure salaryStructure, long salaryRatePaise,
            String benefitsSummary, LocalDate employmentStartDate, LocalDate employmentEndDate, String employmentNotes) {
        return new StaffMember(referenceCode, propertyId, categoryId, fullName, dateOfBirth, salaryStructure, salaryRatePaise, benefitsSummary, employmentStartDate,
                employmentEndDate, employmentNotes);
    }

    public void deactivate(LocalDate endDate, String employmentEndReason, String employmentReview) {
        this.employmentEndDate = clampEndToToday(endDate);
        this.employmentEndReason = employmentEndReason;
        this.employmentReview = employmentReview;
        this.active = false;
    }

    // A future end date deactivates the worker immediately but is recorded as
    // today's date — the directory has no concept of a scheduled future end.
    private static LocalDate clampEndToToday(LocalDate endDate) {
        if (endDate == null) {
            return null;
        }
        LocalDate today = LocalDate.now();
        return endDate.isAfter(today) ? today : endDate;
    }
    public void updateDetails(
            UUID categoryId,
            String fullName,
            LocalDate dateOfBirth,
            SalaryStructure salaryStructure,
            long salaryRatePaise,
            String benefitsSummary,
            LocalDate employmentStartDate,
            LocalDate employmentEndDate,
            String employmentNotes) {
        this.categoryId = categoryId;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.salaryStructure = salaryStructure;
        this.salaryRatePaise = salaryRatePaise;
        this.benefitsSummary = benefitsSummary;
        this.employmentStartDate = employmentStartDate;
        this.employmentEndDate = clampEndToToday(employmentEndDate);
        this.employmentNotes = employmentNotes;
        this.active = this.employmentEndDate == null;
    }

    public void updateVerification(IdentityVerificationStatus status, Instant verifiedAt) {
        this.identityVerificationStatus = status;
        this.identityVerifiedAt = verifiedAt;
    }

}
