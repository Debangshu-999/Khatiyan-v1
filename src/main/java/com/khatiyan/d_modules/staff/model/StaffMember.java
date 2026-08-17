package com.khatiyan.d_modules.staff.model;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
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

    // 7-bit weekday mask for daily staff (Mon=bit0 .. Sun=bit6); 127 = every day.
    // Ignored for monthly staff. See WorkingDays.
    @Column(name = "working_days_mask", nullable = false)
    private int workingDaysMask;

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
            int workingDaysMask, String benefitsSummary, LocalDate employmentStartDate, LocalDate employmentEndDate, String employmentNotes) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.propertyId = propertyId;
        this.categoryId = categoryId;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.identityVerificationStatus = IdentityVerificationStatus.NOT_STARTED;
        this.salaryStructure = salaryStructure;
        this.salaryRatePaise = salaryRatePaise;
        this.workingDaysMask = WorkingDays.normalize(workingDaysMask);
        this.benefitsSummary = benefitsSummary;
        this.employmentStartDate = employmentStartDate;
        this.employmentEndDate = clampEndToToday(employmentEndDate);
        this.employmentNotes = employmentNotes;
        this.active = this.employmentEndDate == null;
    }

    public static StaffMember create(
            String referenceCode, UUID propertyId, UUID categoryId, String fullName, LocalDate dateOfBirth, SalaryStructure salaryStructure, long salaryRatePaise,
            int workingDaysMask, String benefitsSummary, LocalDate employmentStartDate, LocalDate employmentEndDate, String employmentNotes) {
        return new StaffMember(referenceCode, propertyId, categoryId, fullName, dateOfBirth, salaryStructure, salaryRatePaise, workingDaysMask, benefitsSummary,
                employmentStartDate, employmentEndDate, employmentNotes);
    }

    /**
     * Projected payout for a calendar month: monthly staff earn their flat rate;
     * daily staff earn rate x working days that fall in the month.
     */
    public long projectedMonthlyPayablePaise(YearMonth month) {
        if (salaryStructure == SalaryStructure.MONTHLY) {
            return salaryRatePaise;
        }
        return Math.multiplyExact(salaryRatePaise, WorkingDays.countInMonth(workingDaysMask, month));
    }

    public void deactivate(LocalDate endDate, String employmentEndReason, String employmentReview) {
        this.employmentEndDate = clampEndToToday(endDate);
        this.employmentEndReason = employmentEndReason;
        this.employmentReview = employmentReview;
        this.active = false;
    }

    /**
     * Records a leaving date in the future without deactivating.
     *
     * <p>The worker keeps working until that day. A sweep ends them on it;
     * until then they stay in the directory, are still paid, and the end can be
     * called off by editing the record.
     */
    public void scheduleEnd(LocalDate endDate, String employmentEndReason, String employmentReview) {
        if (endDate == null || !endDate.isAfter(LocalDate.now())) {
            throw new ValidationException("A scheduled end date must be in the future.");
        }
        if (employmentStartDate != null && endDate.isBefore(employmentStartDate)) {
            throw new ValidationException("Employment cannot end before it starts.");
        }
        this.employmentEndDate = endDate;
        this.employmentEndReason = employmentEndReason;
        this.employmentReview = employmentReview;
        // active stays true — this is a plan, not a departure.
    }

    /**
     * Closes a scheduled end that has come due.
     *
     * <p>Keeps the date that was scheduled rather than stamping today: if the
     * sweep misses a run, the record should still say the day they actually
     * left. The reason and review were captured when it was scheduled.
     */
    public void endScheduled() {
        this.active = false;
    }

    /** True once a scheduled end has come due, for the sweep that will action it. */
    public boolean isEndDue(LocalDate today) {
        return active && employmentEndDate != null && !employmentEndDate.isAfter(today);
    }

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
            int workingDaysMask,
            String benefitsSummary,
            LocalDate employmentStartDate,
            LocalDate employmentEndDate,
            String employmentNotes) {
        this.categoryId = categoryId;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.salaryStructure = salaryStructure;
        this.salaryRatePaise = salaryRatePaise;
        this.workingDaysMask = WorkingDays.normalize(workingDaysMask);
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
