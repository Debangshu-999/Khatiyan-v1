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

import java.time.LocalDate;
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

    @Builder
    private Tenancy(UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            TenancyBillingType billingType, Long rentAmountPaise, Long depositAmountPaise,
            Long dailyRatePaise, LocalDate startDate,
            LocalDate plannedEndDate) {
        this.id = UUID.randomUUID();
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
    }

    /**
     * Creates a new active monthly tenancy.
     */
    public static Tenancy start(UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long rentAmountPaise, long depositAmountPaise,
            LocalDate startDate) {
        return Tenancy.builder()
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
     * Creates a temporary daily tenancy. The daily rate is copied from the
     * property at creation time so later property rate edits do not change this
     * guest stay.
     */
    public static Tenancy startDaily(UUID userId, UUID propertyId, UUID roomId, UUID createdByUserId,
            long dailyRatePaise, LocalDate startDate, LocalDate plannedEndDate) {
        if (dailyRatePaise <= 0) {
            throw new IllegalArgumentException("Daily rate must be positive");
        }
        validateDailyStayDates(startDate, plannedEndDate);

        return Tenancy.builder()
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
