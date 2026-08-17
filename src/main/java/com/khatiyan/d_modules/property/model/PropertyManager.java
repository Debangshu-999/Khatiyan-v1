package com.khatiyan.d_modules.property.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.ManagerEmploymentDetails;
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

/** Active manager assignment and its employment terms for a property. */
@Entity
@Table(name = "property_managers", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyManager extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", insertable = false, nullable = false, updatable = false)
    private String referenceCode;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "manager_user_id", nullable = false)
    private UUID managerUserId;

    @Column(name = "assigned_by_user_id", nullable = false)
    private UUID assignedByUserId;

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

    @Column(name = "employment_start_date")
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

    private PropertyManager(
            UUID propertyId,
            UUID managerUserId,
            UUID assignedByUserId,
            ManagerEmploymentDetails employment) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.managerUserId = managerUserId;
        this.assignedByUserId = assignedByUserId;
        this.referenceCode = "";
        this.dateOfBirth = employment.dateOfBirth();
        this.identityVerificationStatus = employment.identityVerificationStatus();
        this.identityVerifiedAt = employment.identityVerifiedAt();
        this.salaryStructure = employment.salaryStructure();
        this.salaryRatePaise = employment.salaryRatePaise();
        this.benefitsSummary = employment.benefitsSummary();
        this.employmentStartDate = employment.employmentStartDate();
        this.employmentEndDate = employment.employmentEndDate();
        this.employmentNotes = employment.employmentNotes();
        this.active = true;
    }

    public static PropertyManager assign(
            UUID propertyId,
            UUID managerUserId,
            UUID assignedByUserId,
            ManagerEmploymentDetails employment) {
        return new PropertyManager(propertyId, managerUserId, assignedByUserId, employment);
    }

    public void deactivate() {
        this.active = false;
    }

    /** Ends the assignment with an exit reason + review for the employee history. */
    public void endEmployment(LocalDate endDate, String employmentEndReason, String employmentReview) {
        ensureEmploymentDatesOrdered(this.employmentStartDate, endDate);
        this.active = false;
        this.employmentEndDate = endDate;
        this.employmentEndReason = employmentEndReason;
        this.employmentReview = employmentReview;
    }

    /**
     * Records a leaving date in the future without removing the assignment.
     *
     * <p>The manager keeps their access until that day; a sweep ends them on it.
     */
    public void scheduleEnd(LocalDate endDate, String employmentEndReason, String employmentReview) {
        if (endDate == null || !endDate.isAfter(LocalDate.now())) {
            throw new ValidationException("A scheduled end date must be in the future.");
        }
        ensureEmploymentDatesOrdered(this.employmentStartDate, endDate);
        this.employmentEndDate = endDate;
        this.employmentEndReason = employmentEndReason;
        this.employmentReview = employmentReview;
    }

    /** Closes a scheduled end that has come due, keeping the scheduled date. */
    public void endScheduled() {
        this.active = false;
    }

    /** True once a scheduled end has come due, for the sweep that will action it. */
    public boolean isEndDue(LocalDate today) {
        return active && employmentEndDate != null && !employmentEndDate.isAfter(today);
    }

    /** Applies an edited employment snapshot (owner-driven). Identity and pay
     * terms are replaced wholesale; the access assignment is unaffected. */
    public void updateEmployment(ManagerEmploymentDetails employment) {
        ensureEmploymentDatesOrdered(employment.employmentStartDate(), employment.employmentEndDate());
        this.dateOfBirth = employment.dateOfBirth();
        this.identityVerificationStatus = employment.identityVerificationStatus();
        this.identityVerifiedAt = employment.identityVerifiedAt();
        this.salaryStructure = employment.salaryStructure();
        this.salaryRatePaise = employment.salaryRatePaise();
        this.benefitsSummary = employment.benefitsSummary();
        this.employmentStartDate = employment.employmentStartDate();
        this.employmentEndDate = employment.employmentEndDate();
        this.employmentNotes = employment.employmentNotes();
    }

    /**
     * Employment cannot end before it began.
     *
     * <p>The database says the same thing through
     * chk_property_managers_employment_dates, but a constraint violation reaches
     * the owner as a 500 with no explanation. Checked here so the two paths that
     * can break it — ending a manager whose start date is still in the future,
     * and editing the dates directly — say why.
     */
    private void ensureEmploymentDatesOrdered(LocalDate startDate, LocalDate endDate) {
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new ValidationException(
                    "Employment cannot end before it starts. This record begins on " + startDate + ".");
        }
    }

    public boolean isCurrentlyActive() {
        return active;
    }
}
