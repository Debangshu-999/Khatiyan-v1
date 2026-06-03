package com.khatiyan.d_modules.billing.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

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

/**
 * Live payable billing workspace for a tenancy period.
 *
 * <p>
 * A billing cycle is editable only according to billing rules. Once payment
 * succeeds, the cycle itself becomes paid.
 */
@Entity
@Table(name = "billing_cycles", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BillingCycle extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "tenant_name_snapshot", nullable = false, length = 120)
    private String tenantNameSnapshot;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_type", nullable = false, length = 20)
    private TenancyBillingType billingType;

    @Column(name = "cycle_number", nullable = false)
    private int cycleNumber;

    @Column(name = "period_start_date", nullable = false)
    private LocalDate periodStartDate;

    @Column(name = "period_end_date", nullable = false)
    private LocalDate periodEndDate;

    @Column(name = "rent_due_date", nullable = false)
    private LocalDate rentDueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_collection_timing", nullable = false, length = 20)
    private BillingCollectionTiming billingCollectionTiming;

    @Column(name = "rent_grace_days", nullable = false)
    private int rentGraceDays;

    @Column(name = "base_amount_paise", nullable = false)
    private long baseAmountPaise;

    @Column(name = "extra_charge_paise", nullable = false)
    private long extraChargePaise;

    @Column(name = "late_fee_amount_paise", nullable = false)
    private long lateFeeAmountPaise;

    @Column(name = "discount_amount_paise", nullable = false)
    private long discountAmountPaise;

    @Column(name = "total_amount_paise", nullable = false)
    private long totalAmountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BillingCycleStatus status;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Builder
    private BillingCycle(
            UUID tenancyId,
            String referenceCode,
            UUID tenantUserId,
            String tenantNameSnapshot,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            int cycleNumber,
            LocalDate periodStartDate,
            LocalDate periodEndDate,
            LocalDate rentDueDate,
            BillingCollectionTiming billingCollectionTiming,
            int rentGraceDays) {
        validateCycleDates(periodStartDate, periodEndDate, rentDueDate);
        if (cycleNumber <= 0) {
            throw new ValidationException("Billing cycle number must be positive");
        }
        if (billingCollectionTiming == null) {
            throw new ValidationException("Billing collection timing is required");
        }
        if (rentGraceDays < 0 || rentGraceDays > 30) {
            throw new ValidationException("Rent grace days must be between 0 and 30");
        }

        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.tenantNameSnapshot = tenantNameSnapshot;
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.billingType = billingType;
        this.cycleNumber = cycleNumber;
        this.periodStartDate = periodStartDate;
        this.periodEndDate = periodEndDate;
        this.rentDueDate = rentDueDate;
        this.billingCollectionTiming = billingCollectionTiming;
        this.rentGraceDays = rentGraceDays;
        this.status = BillingCycleStatus.UNPAID;
        this.baseAmountPaise = 0;
        this.extraChargePaise = 0;
        this.lateFeeAmountPaise = 0;
        this.discountAmountPaise = 0;
        this.totalAmountPaise = 0;
    }

    public static BillingCycle create(
            UUID tenancyId,
            UUID tenantUserId,
            String tenantNameSnapshot,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            int cycleNumber,
            LocalDate periodStartDate,
            LocalDate periodEndDate,
            LocalDate rentDueDate,
            BillingCollectionTiming billingCollectionTiming,
            int rentGraceDays) {
        return create(
                tenancyId,
                "BIL-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                tenantUserId,
                tenantNameSnapshot,
                propertyId,
                roomId,
                billingType,
                cycleNumber,
                periodStartDate,
                periodEndDate,
                rentDueDate,
                billingCollectionTiming,
                rentGraceDays);
    }

    public static BillingCycle create(
            UUID tenancyId,
            String referenceCode,
            UUID tenantUserId,
            String tenantNameSnapshot,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            int cycleNumber,
            LocalDate periodStartDate,
            LocalDate periodEndDate,
            LocalDate rentDueDate,
            BillingCollectionTiming billingCollectionTiming,
            int rentGraceDays) {
        return BillingCycle.builder()
                .tenancyId(tenancyId)
                .referenceCode(referenceCode)
                .tenantUserId(tenantUserId)
                .tenantNameSnapshot(tenantNameSnapshot)
                .propertyId(propertyId)
                .roomId(roomId)
                .billingType(billingType)
                .cycleNumber(cycleNumber)
                .periodStartDate(periodStartDate)
                .periodEndDate(periodEndDate)
                .rentDueDate(rentDueDate)
                .billingCollectionTiming(billingCollectionTiming)
                .rentGraceDays(rentGraceDays)
                .build();
    }

    public void recalculateTotals(
            long baseAmountPaise,
            long depositAmountPaise,
            long extraChargePaise,
            long lateFeeAmountPaise,
            long discountAmountPaise) {
        ensureNotPaidOrCancelled();
        validateNonNegative(baseAmountPaise, "Base amount cannot be negative");
        validateNonNegative(depositAmountPaise, "Deposit amount cannot be negative");
        validateNonNegative(extraChargePaise, "Extra amount cannot be negative");
        validateNonNegative(lateFeeAmountPaise, "Late fee amount cannot be negative");
        validateNonNegative(discountAmountPaise, "Discount amount cannot be negative");

        long grossAmount = baseAmountPaise + depositAmountPaise + extraChargePaise + lateFeeAmountPaise;
        long totalAmount = grossAmount - discountAmountPaise;
        if (totalAmount < 0) {
            throw new ValidationException("Discount cannot be greater than payable amount");
        }
        if (billingType == TenancyBillingType.MONTHLY
                && cycleNumber == 1
                && depositAmountPaise > 0
                && totalAmount < depositAmountPaise) {
            throw new ValidationException("First billing cycle payable amount cannot be less than deposit amount");
        }

        this.baseAmountPaise = baseAmountPaise;
        this.extraChargePaise = extraChargePaise;
        this.lateFeeAmountPaise = lateFeeAmountPaise;
        this.discountAmountPaise = discountAmountPaise;
        this.totalAmountPaise = totalAmount;
    }

    public boolean isEditableForExtraCharges(LocalDate today) {
        if (status != BillingCycleStatus.UNPAID && status != BillingCycleStatus.OVERDUE) {
            return false;
        }

        if (today.isBefore(rentDueDate.minusDays(1))) {
            return true;
        }

        return today.isAfter(rentDueDate);
    }

    public boolean isEditableForDailyCycle(LocalDate today) {
        if (billingType != TenancyBillingType.DAILY) {
            return false;
        }

        if (status != BillingCycleStatus.UNPAID) {
            return false;
        }

        return today.isBefore(rentDueDate.minusDays(1));
    }

    public boolean isEditableForLateFee(LocalDate today) {
        if (status != BillingCycleStatus.OVERDUE) {
            return false;
        }

        return today.isAfter(rentDueDate);
    }

    public void markOverdue(LocalDate today) {
        if (status != BillingCycleStatus.UNPAID) {
            return;
        }

        if (today.isAfter(rentDueDate)) {
            this.status = BillingCycleStatus.OVERDUE;
        }
    }

    public void markPaid(Instant paidAt) {
        ensureNotPaidOrCancelled();
        if (totalAmountPaise <= 0) {
            throw new ValidationException("Cannot mark an empty billing cycle as paid");
        }

        this.status = BillingCycleStatus.PAID;
        this.paidAt = paidAt;
    }

    public void cancel() {
        ensureNotPaidOrCancelled();
        this.status = BillingCycleStatus.CANCELLED;
    }

    public boolean isPaid() {
        return status == BillingCycleStatus.PAID;
    }

    public boolean isCancelled() {
        return status == BillingCycleStatus.CANCELLED;
    }

    private void ensureNotPaidOrCancelled() {
        if (status == BillingCycleStatus.PAID) {
            throw new ValidationException("Paid billing cycle cannot be edited");
        }

        if (status == BillingCycleStatus.CANCELLED) {
            throw new ValidationException("Cancelled billing cycle cannot be edited");
        }
    }

    private static void validateCycleDates(LocalDate periodStartDate, LocalDate periodEndDate, LocalDate rentDueDate) {
        if (periodStartDate == null || periodEndDate == null || rentDueDate == null) {
            throw new ValidationException("Billing cycle dates are required");
        }

        if (periodEndDate.isBefore(periodStartDate)) {
            throw new ValidationException("Billing period end date cannot be before start date");
        }
    }

    private static void validateNonNegative(long value, String message) {
        if (value < 0) {
            throw new ValidationException(message);
        }
    }
}
