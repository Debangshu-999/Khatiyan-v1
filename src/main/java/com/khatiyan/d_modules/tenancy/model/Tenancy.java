package com.khatiyan.d_modules.tenancy.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

/**
 * A tenancy is the relationship between a tenant (user) and a room
 * within a property, valid over a date range. It also records which
 * authenticated user created the tenancy, so the owner/manager action
 * remains auditable even though the tenant is stored separately as
 * {@code userId}.
 *
 * <p>
 * This class is technically {@code public} so JPA, Spring Data,
 * and other classes within this module can access it. Module
 * boundaries are enforced by ArchUnit instead — other modules must
 * not import this type, and the build will fail if they do.
 * Outside callers go through
 * {@link com.khatiyan.d_modules.tenancy.TenancyModule}.
 */
@Entity
@Table(name = "tenancies", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tenancy extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_type", nullable = false, length = 20)
    private TenancyBillingType billingType;

    @Column(name = "rent_amount_paise")
    private Long rentAmountPaise;

    @Column(name = "deposit_amount_paise")
    private Long depositAmountPaise;

    @Column(name = "daily_rate_paise")
    private Long dailyRatePaise;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "planned_end_date")
    private LocalDate plannedEndDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TenancyStatus status;

    @Column(name = "exit_reason")
    private String exitReason;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "billing_started", nullable = false)
    private boolean billingStarted;

    // False only while a monthly tenancy created with an agreement waits for the
    // tenant to accept. True for every other tenancy (no-agreement paths and
    // grandfathered existing rows).
    @Column(name = "tos_accepted", nullable = false)
    private boolean tosAccepted;

    // Lock-in / early-exit terms, stamped from the accepted agreement at
    // acceptance (agreement-backed tenancies only). lockInEndDate is a
    // minimum-stay MARKER — it never auto-terminates the tenancy. Its presence is
    // also what marks a tenancy agreement-backed (premature-only exit).
    @Column(name = "lock_in_end_date")
    private LocalDate lockInEndDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "early_exit_penalty_type", length = 20)
    private EarlyExitPenaltyType earlyExitPenaltyType;

    @Column(name = "early_exit_penalty_fixed_paise")
    private Long earlyExitPenaltyFixedPaise;

    // The owner's declaration that they collected and checked this tenant's ID
    // proof and photograph before onboarding. Khatiyan verifies nothing and stores
    // no document or image — tenant ID verification and police notification are the
    // landlord's legal duty, so this is a record of *their* statement, attributable
    // and timestamped. Null on tenancies created before the declaration existed.
    @Column(name = "id_check_confirmed")
    private Boolean idCheckConfirmed;

    @Column(name = "id_checked_by_user_id")
    private UUID idCheckedByUserId;

    @Column(name = "id_checked_at")
    private Instant idCheckedAt;

    /** Records the owner's declaration at onboarding. Never set on the tenant's behalf. */
    public void confirmIdCheck(UUID actorUserId, Instant at) {
        this.idCheckConfirmed = true;
        this.idCheckedByUserId = actorUserId;
        this.idCheckedAt = at;
    }

    @Builder
    private Tenancy(String referenceCode, UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            TenancyBillingType billingType, Long rentAmountPaise, Long depositAmountPaise,
            Long dailyRatePaise, LocalDate startDate,
            LocalDate plannedEndDate) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.userId = userId;
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.createdByUserId = createdByUserId;
        this.billingType = billingType;
        this.rentAmountPaise = rentAmountPaise;
        this.depositAmountPaise = depositAmountPaise;
        this.dailyRatePaise = dailyRatePaise;
        this.startDate = startDate;
        this.plannedEndDate = plannedEndDate;
        this.status = TenancyStatus.ACTIVE;
        this.active = true;
        this.billingStarted = false;
        this.tosAccepted = true;
    }

    /**
     * Creates a new active monthly tenancy.
     */
    public static Tenancy start(UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long rentAmountPaise, long depositAmountPaise,
            LocalDate startDate) {
        return start(
                "TEN-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                userId,
                propertyId,
                roomId,
                createdByUserId,
                rentAmountPaise,
                depositAmountPaise,
                startDate);
    }

    public static Tenancy start(String referenceCode, UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long rentAmountPaise, long depositAmountPaise,
            LocalDate startDate) {
        return Tenancy.builder()
                .referenceCode(referenceCode)
                .userId(userId)
                .propertyId(propertyId)
                .roomId(roomId)
                .createdByUserId(createdByUserId)
                .billingType(TenancyBillingType.MONTHLY)
                .rentAmountPaise(rentAmountPaise)
                .depositAmountPaise(depositAmountPaise)
                .startDate(startDate)
                .build();
    }

    /**
     * Holds a freshly built monthly tenancy as {@code PENDING_ACCEPTANCE} before
     * it is saved: the bed is still reserved (the caller publishes
     * {@code TenancyStartedEvent}), but the tenant must accept the agreement
     * before it activates — until then the user is not an active tenant and
     * billing has not started.
     */
    public void markPendingAcceptance() {
        if (this.status != TenancyStatus.ACTIVE || !isMonthly()) {
            throw new IllegalStateException("Only a new monthly tenancy can be held for acceptance");
        }
        this.status = TenancyStatus.PENDING_ACCEPTANCE;
        this.tosAccepted = false;
    }

    /**
     * Creates a temporary daily tenancy. The daily rate is copied from the
     * property at creation time so later property rate edits do not change this
     * guest stay.
     */
    public static Tenancy startDaily(UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long dailyRatePaise, LocalDate startDate, LocalDate plannedEndDate) {
        return startDaily(
                "TEN-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                userId,
                propertyId,
                roomId,
                createdByUserId,
                dailyRatePaise,
                startDate,
                plannedEndDate);
    }

    public static Tenancy startDaily(String referenceCode, UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long dailyRatePaise, LocalDate startDate, LocalDate plannedEndDate) {
        if (dailyRatePaise <= 0) {
            throw new IllegalArgumentException("Daily rate must be positive");
        }
        validateDailyStayDates(startDate, plannedEndDate);

        return Tenancy.builder()
                .referenceCode(referenceCode)
                .userId(userId)
                .propertyId(propertyId)
                .roomId(roomId)
                .createdByUserId(createdByUserId)
                .billingType(TenancyBillingType.DAILY)
                .dailyRatePaise(dailyRatePaise)
                .startDate(startDate)
                .plannedEndDate(plannedEndDate)
                .build();
    }

    public void end(LocalDate endDate, String reason) {
        if (!isCurrentlyActive()) {
            throw new IllegalStateException("Cannot end a tenancy that is not active");
        }
        if (endDate.isBefore(this.startDate)) {
            throw new IllegalArgumentException("end_date cannot be before start_date");
        }
        this.endDate = endDate;
        this.exitReason = reason;
        this.status = TenancyStatus.EXITED;
        this.active = false;
    }

    public void markOnNotice() {
        ensureActive();
        this.status = TenancyStatus.ON_NOTICE;
    }

    public void markOnPrematureNotice() {
        ensureActive();
        this.status = TenancyStatus.ON_PREMATURE_NOTICE;
    }

    public void scheduleEndDate(LocalDate endDate) {
        ensureActive();
        if (endDate == null) {
            throw new IllegalArgumentException("end_date is required");
        }
        if (endDate.isBefore(this.startDate)) {
            throw new IllegalArgumentException("end_date cannot be before start_date");
        }
        this.endDate = endDate;
    }

    public void transferRoom(UUID newRoomId, long newRentAmountPaise) {
        ensureActive();
        ensureMonthly();

        if (newRoomId == null) {
            throw new IllegalArgumentException("New room is required");
        }

        if (this.roomId.equals(newRoomId)) {
            throw new IllegalArgumentException("New room must be different from the current room");
        }

        if (newRentAmountPaise <= 0) {
            throw new IllegalArgumentException("Rent amount must be positive");
        }

        this.roomId = newRoomId;
        this.rentAmountPaise = newRentAmountPaise;
    }

    public boolean isCurrentlyActive() {
        return active && (
                status == TenancyStatus.ACTIVE
                || status == TenancyStatus.ON_NOTICE
                || status == TenancyStatus.ON_PREMATURE_NOTICE);
    }

    public void updateSetupTerms(
            Long rentAmountPaise,
            Long depositAmountPaise) {
        ensureActive();
        ensureBillingNotStarted();
        ensureMonthly();

        if (rentAmountPaise == null && depositAmountPaise == null) {
            throw new IllegalArgumentException("At least one tenancy setup field must be provided");
        }

        if (rentAmountPaise != null) {
            if (rentAmountPaise <= 0) {
                throw new IllegalArgumentException("Rent amount must be positive");
            }
            this.rentAmountPaise = rentAmountPaise;
        }

        if (depositAmountPaise != null) {
            if (depositAmountPaise < 0) {
                throw new IllegalArgumentException("Deposit amount cannot be negative");
            }
            this.depositAmountPaise = depositAmountPaise;
        }

    }

    public void markBillingStarted() {
        ensureActive();
        this.billingStarted = true;
    }

    /**
     * Accepts the agreement: moves a pending tenancy to active. The caller then
     * marks the user an active tenant and starts billing.
     */
    public void acceptTos() {
        if (this.status != TenancyStatus.PENDING_ACCEPTANCE) {
            throw new IllegalStateException("Tenancy is not pending acceptance");
        }
        this.status = TenancyStatus.ACTIVE;
        this.tosAccepted = true;
    }

    /**
     * Cancels a pending tenancy (tenant declined, or the acceptance window
     * expired). The bed is freed by the caller.
     */
    public void cancelPending(String reason) {
        if (this.status != TenancyStatus.PENDING_ACCEPTANCE) {
            throw new IllegalStateException("Only a pending tenancy can be cancelled");
        }
        this.status = TenancyStatus.CANCELLED;
        this.active = false;
        this.exitReason = reason;
    }

    public boolean isPendingAcceptance() {
        return this.status == TenancyStatus.PENDING_ACCEPTANCE;
    }

    /**
     * Stamps the resolved lock-in / early-exit terms from the accepted agreement.
     * Called once at acceptance so the tenancy module can compute early-exit
     * penalties itself, without ever reading the compliance agreement.
     */
    public void stampAgreementExitTerms(
            LocalDate lockInEndDate, EarlyExitPenaltyType penaltyType, Long penaltyFixedPaise) {
        this.lockInEndDate = lockInEndDate;
        this.earlyExitPenaltyType = penaltyType;
        this.earlyExitPenaltyFixedPaise = penaltyFixedPaise;
    }

    /** Agreement-backed tenancies carry stamped lock-in terms and exit premature-only. */
    public boolean isAgreementBacked() {
        return lockInEndDate != null;
    }

    /** True while the given checkout date still falls inside the lock-in period. */
    public boolean isWithinLockIn(LocalDate checkoutDate) {
        return lockInEndDate != null && checkoutDate != null && checkoutDate.isBefore(lockInEndDate);
    }

    /**
     * The early-exit penalty for leaving on {@code checkoutDate}. Zero for
     * non-agreement tenancies and for checkouts on/after the lock-in end (the
     * minimum stay has been served). REMAINING_TERM prorates the remaining
     * lock-in days over a 30-day month against the monthly rent; FIXED returns
     * the flat amount.
     */
    public long earlyExitPenaltyPaise(LocalDate checkoutDate) {
        if (lockInEndDate == null || checkoutDate == null) {
            return 0L;
        }
        long daysRemaining = ChronoUnit.DAYS.between(checkoutDate, lockInEndDate);
        if (daysRemaining <= 0) {
            return 0L;
        }
        if (earlyExitPenaltyType == EarlyExitPenaltyType.FIXED) {
            return earlyExitPenaltyFixedPaise != null ? earlyExitPenaltyFixedPaise : 0L;
        }
        long rent = rentAmountPaise != null ? rentAmountPaise : 0L;
        return Math.round((double) rent * daysRemaining / 30.0);
    }

    public boolean isMonthly() {
        return billingType == TenancyBillingType.MONTHLY;
    }

    public boolean isDaily() {
        return billingType == TenancyBillingType.DAILY;
    }

    private void ensureActive() {
        if (!isCurrentlyActive()) {
            throw new IllegalStateException("Tenancy is not active");
        }
    }

    private void ensureBillingNotStarted() {
        if (billingStarted) {
            throw new IllegalStateException("Tenancy billing has already started");
        }
    }

    private void ensureMonthly() {
        if (!isMonthly()) {
            throw new IllegalStateException("Only monthly tenancy setup terms can be updated");
        }
    }

    private static void validateDailyStayDates(LocalDate startDate, LocalDate plannedEndDate) {
        if (plannedEndDate == null) {
            throw new IllegalArgumentException("planned_end_date is required for daily tenancy");
        }
        if (!plannedEndDate.isAfter(startDate)) {
            throw new IllegalArgumentException("planned_end_date must be after start_date");
        }
        if (!plannedEndDate.isBefore(startDate.plusDays(30))) {
            throw new IllegalArgumentException("Daily tenancy must be less than 30 days");
        }
    }

}
