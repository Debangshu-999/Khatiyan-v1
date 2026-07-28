package com.khatiyan.d_modules.billing.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

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
 * Tenant-scoped billing line item.
 *
 * <p>
 * Pending rows wait for the next generated billing cycle. Added rows are
 * attached to a concrete billing cycle and count toward that cycle total.
 */
@Entity
@Table(name = "billing_cycle_line_items", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BillingCycleLineItem extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "billing_cycle_id")
    private UUID billingCycleId;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private BillingCycleLineItemType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BillingCycleLineItemStatus status;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(length = 500)
    private String description;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "settlement_amount_paise", nullable = false)
    private long settlementAmountPaise;

    @Enumerated(EnumType.STRING)
    @Column(name = "settlement_action", nullable = false, length = 40)
    private BillingLineSettlementAction settlementAction;

    @Column(name = "system_generated", nullable = false)
    private boolean systemGenerated;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    @Column(name = "last_adjusted_by_user_id")
    private UUID lastAdjustedByUserId;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder
    private BillingCycleLineItem(
            UUID billingCycleId,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            BillingCycleLineItemType type,
            BillingCycleLineItemStatus status,
            String label,
            String description,
            long amountPaise,
            long settlementAmountPaise,
            BillingLineSettlementAction settlementAction,
            boolean systemGenerated,
            UUID createdByUserId,
            int displayOrder) {
        validateAmount(amountPaise);
        validateAmount(settlementAmountPaise);
        if (tenancyId == null || tenantUserId == null || propertyId == null) {
            throw new ValidationException("Billing line tenancy identifiers are required");
        }
        if (displayOrder <= 0) {
            throw new ValidationException("Billing line display order must be positive");
        }
        if (status == BillingCycleLineItemStatus.ADDED && billingCycleId == null) {
            throw new ValidationException("Added billing line needs a billing cycle");
        }

        this.id = UUID.randomUUID();
        this.billingCycleId = billingCycleId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.type = type;
        this.status = status;
        this.label = label;
        this.description = description;
        this.amountPaise = amountPaise;
        this.settlementAmountPaise = settlementAmountPaise;
        this.settlementAction = settlementAction;
        this.systemGenerated = systemGenerated;
        this.createdByUserId = createdByUserId;
        this.displayOrder = displayOrder;
    }

    public static BillingCycleLineItem systemCharge(
            BillingCycle cycle,
            BillingCycleLineItemType type,
            String label,
            String description,
            long amountPaise,
            int displayOrder) {
        return BillingCycleLineItem.builder()
                .billingCycleId(cycle.getId())
                .tenancyId(cycle.getTenancyId())
                .tenantUserId(cycle.getTenantUserId())
                .propertyId(cycle.getPropertyId())
                .type(type)
                .status(BillingCycleLineItemStatus.ADDED)
                .label(label)
                .description(description)
                .amountPaise(amountPaise)
                .settlementAmountPaise(amountPaise)
                .settlementAction(BillingLineSettlementAction.SYSTEM_CHARGE)
                .systemGenerated(true)
                .displayOrder(displayOrder)
                .build();
    }

    public static BillingCycleLineItem systemDepositCharge(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            int displayOrder) {
        return systemCharge(cycle, BillingCycleLineItemType.DEPOSIT, label, description, amountPaise, displayOrder);
    }

    public static BillingCycleLineItem pendingExtraChargeAddedToBill(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            UUID createdByUserId,
            int displayOrder) {
        return pendingAdminLine(
                cycle,
                BillingCycleLineItemType.EXTRA_CHARGE,
                label,
                description,
                amountPaise,
                amountPaise,
                BillingLineSettlementAction.ADDED_TO_BILL,
                createdByUserId,
                displayOrder);
    }

    public static BillingCycleLineItem pendingExtraChargeAdjustedFromDeposit(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            UUID createdByUserId,
            int displayOrder) {
        return pendingAdminLine(
                cycle,
                BillingCycleLineItemType.EXTRA_CHARGE,
                label,
                description,
                0,
                amountPaise,
                BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT,
                createdByUserId,
                displayOrder);
    }

    public static BillingCycleLineItem pendingDiscount(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            UUID createdByUserId,
            int displayOrder) {
        return pendingAdminLine(
                cycle,
                BillingCycleLineItemType.DISCOUNT,
                label,
                description,
                amountPaise,
                amountPaise,
                BillingLineSettlementAction.DISCOUNTED,
                createdByUserId,
                displayOrder);
    }

    private static BillingCycleLineItem pendingAdminLine(
            BillingCycle cycle,
            BillingCycleLineItemType type,
            String label,
            String description,
            long amountPaise,
            long settlementAmountPaise,
            BillingLineSettlementAction settlementAction,
            UUID createdByUserId,
            int displayOrder) {
        return BillingCycleLineItem.builder()
                .tenancyId(cycle.getTenancyId())
                .tenantUserId(cycle.getTenantUserId())
                .propertyId(cycle.getPropertyId())
                .type(type)
                .status(BillingCycleLineItemStatus.PENDING)
                .label(label)
                .description(description)
                .amountPaise(amountPaise)
                .settlementAmountPaise(settlementAmountPaise)
                .settlementAction(settlementAction)
                .systemGenerated(false)
                .createdByUserId(createdByUserId)
                .displayOrder(displayOrder)
                .build();
    }

    public static BillingCycleLineItem extraChargeAddedToBill(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            UUID createdByUserId,
            int displayOrder) {
        return BillingCycleLineItem.builder()
                .billingCycleId(cycle.getId())
                .tenancyId(cycle.getTenancyId())
                .tenantUserId(cycle.getTenantUserId())
                .propertyId(cycle.getPropertyId())
                .type(BillingCycleLineItemType.EXTRA_CHARGE)
                .status(BillingCycleLineItemStatus.ADDED)
                .label(label)
                .description(description)
                .amountPaise(amountPaise)
                .settlementAmountPaise(amountPaise)
                .settlementAction(BillingLineSettlementAction.ADDED_TO_BILL)
                .systemGenerated(false)
                .createdByUserId(createdByUserId)
                .displayOrder(displayOrder)
                .build();
    }

    public static BillingCycleLineItem discount(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            UUID createdByUserId,
            int displayOrder) {
        return BillingCycleLineItem.builder()
                .billingCycleId(cycle.getId())
                .tenancyId(cycle.getTenancyId())
                .tenantUserId(cycle.getTenantUserId())
                .propertyId(cycle.getPropertyId())
                .type(BillingCycleLineItemType.DISCOUNT)
                .status(BillingCycleLineItemStatus.ADDED)
                .label(label)
                .description(description)
                .amountPaise(amountPaise)
                .settlementAmountPaise(amountPaise)
                .settlementAction(BillingLineSettlementAction.DISCOUNTED)
                .systemGenerated(false)
                .createdByUserId(createdByUserId)
                .displayOrder(displayOrder)
                .build();
    }

    public static BillingCycleLineItem lateFee(
            BillingCycle cycle,
            String label,
            String description,
            long amountPaise,
            int displayOrder) {
        return BillingCycleLineItem.builder()
                .billingCycleId(cycle.getId())
                .tenancyId(cycle.getTenancyId())
                .tenantUserId(cycle.getTenantUserId())
                .propertyId(cycle.getPropertyId())
                .type(BillingCycleLineItemType.LATE_FEE)
                .status(BillingCycleLineItemStatus.ADDED)
                .label(label)
                .description(description)
                .amountPaise(amountPaise)
                .settlementAmountPaise(amountPaise)
                .settlementAction(BillingLineSettlementAction.SYSTEM_CHARGE)
                .systemGenerated(true)
                .displayOrder(displayOrder)
                .build();
    }

    public void attachToCycle(UUID billingCycleId, int displayOrder) {
        if (status != BillingCycleLineItemStatus.PENDING) {
            throw new ValidationException("Only pending billing lines can be attached to a cycle");
        }
        if (billingCycleId == null) {
            throw new ValidationException("Billing cycle is required");
        }

        this.billingCycleId = billingCycleId;
        this.status = BillingCycleLineItemStatus.ADDED;
        this.displayOrder = displayOrder;
    }

    public void replaceSystemLateFee(long amountPaise) {
        if (type != BillingCycleLineItemType.LATE_FEE) {
            throw new ValidationException("Only late fee lines can be updated as late fee");
        }
        if (!systemGenerated || lastAdjustedByUserId != null) {
            throw new ValidationException("Manually adjusted late fee cannot be replaced automatically");
        }

        validateAmount(amountPaise);
        this.amountPaise = amountPaise;
        this.settlementAmountPaise = amountPaise;
        this.settlementAction = BillingLineSettlementAction.SYSTEM_CHARGE;
    }

    public void adjust(long newAmountPaise, UUID adjustedByUserId) {
        ensureEditableLine();
        validatePositiveAmount(newAmountPaise);

        if (settlementAction == BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT) {
            this.amountPaise = 0;
            this.settlementAmountPaise = newAmountPaise;
            this.lastAdjustedByUserId = adjustedByUserId;
            return;
        }

        this.amountPaise = newAmountPaise;
        this.settlementAmountPaise = newAmountPaise;
        this.settlementAction = resolveAdjustedSettlementAction();
        this.lastAdjustedByUserId = adjustedByUserId;
    }

    public void clear(UUID adjustedByUserId) {
        ensureEditableLine();

        this.amountPaise = 0;
        this.settlementAmountPaise = 0;
        this.settlementAction = BillingLineSettlementAction.WAIVED;
        this.lastAdjustedByUserId = adjustedByUserId;
    }

    public void adjustFromDeposit(Long newAmountPaise, UUID adjustedByUserId) {
        ensureEditableLine();
        ensureChargeLine();

        long deductionAmountPaise = amountOrCurrentChargeAmount(newAmountPaise);

        this.amountPaise = 0;
        this.settlementAmountPaise = deductionAmountPaise;
        this.settlementAction = BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT;
        this.lastAdjustedByUserId = adjustedByUserId;
    }

    public void adjustToBill(Long newAmountPaise, UUID adjustedByUserId) {
        ensureEditableLine();
        ensureChargeLine();

        long billAmountPaise = amountOrCurrentChargeAmount(newAmountPaise);

        this.amountPaise = billAmountPaise;
        this.settlementAmountPaise = billAmountPaise;
        this.settlementAction = BillingLineSettlementAction.ADDED_TO_BILL;
        this.lastAdjustedByUserId = adjustedByUserId;
    }

    public boolean contributesToBaseAmount() {
        return status == BillingCycleLineItemStatus.ADDED
                && (type == BillingCycleLineItemType.RENT
                        || type == BillingCycleLineItemType.DAILY_STAY);
    }

    public boolean contributesToBaseDeposit() {
        return status == BillingCycleLineItemStatus.ADDED
                && type == BillingCycleLineItemType.DEPOSIT;
    }

    public boolean contributesToExtraAmount() {
        // SYSTEM_CHARGE covers system-imposed extra charges (e.g. an early-exit
        // penalty), mirroring how late fees count both actions.
        return status == BillingCycleLineItemStatus.ADDED
                && type == BillingCycleLineItemType.EXTRA_CHARGE
                && (settlementAction == BillingLineSettlementAction.ADDED_TO_BILL
                        || settlementAction == BillingLineSettlementAction.SYSTEM_CHARGE);
    }

    public boolean contributesToLateFeeAmount() {
        return status == BillingCycleLineItemStatus.ADDED
                && type == BillingCycleLineItemType.LATE_FEE
                && (settlementAction == BillingLineSettlementAction.ADDED_TO_BILL
                        || settlementAction == BillingLineSettlementAction.SYSTEM_CHARGE);
    }

    public boolean contributesToDiscountAmount() {
        return status == BillingCycleLineItemStatus.ADDED
                && type == BillingCycleLineItemType.DISCOUNT
                && settlementAction == BillingLineSettlementAction.DISCOUNTED;
    }

    public boolean isEditableByAdmin() {
        return type == BillingCycleLineItemType.EXTRA_CHARGE
                || type == BillingCycleLineItemType.LATE_FEE
                || type == BillingCycleLineItemType.DISCOUNT;
    }

    private BillingLineSettlementAction resolveAdjustedSettlementAction() {
        if (type == BillingCycleLineItemType.DISCOUNT) {
            return BillingLineSettlementAction.DISCOUNTED;
        }

        return BillingLineSettlementAction.ADDED_TO_BILL;
    }

    private void ensureEditableLine() {
        if (!isEditableByAdmin()) {
            throw new ValidationException("This billing line cannot be edited manually");
        }
    }

    private void ensureChargeLine() {
        if (type != BillingCycleLineItemType.EXTRA_CHARGE
                && type != BillingCycleLineItemType.LATE_FEE) {
            throw new ValidationException("Only charge lines can change bill/deposit settlement");
        }
    }

    private long amountOrCurrentChargeAmount(Long newAmountPaise) {
        if (newAmountPaise != null) {
            validatePositiveAmount(newAmountPaise);
            return newAmountPaise;
        }

        long currentChargeAmount = settlementAmountPaise > 0 ? settlementAmountPaise : amountPaise;
        validatePositiveAmount(currentChargeAmount);
        return currentChargeAmount;
    }

    private static void validateAmount(long amountPaise) {
        if (amountPaise < 0) {
            throw new ValidationException("Billing line amount cannot be negative");
        }
    }

    private static void validatePositiveAmount(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Billing line amount must be positive");
        }
    }
}
