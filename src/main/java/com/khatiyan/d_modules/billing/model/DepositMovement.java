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
 * Deposit ledger row describing one deposit balance change.
 *
 * <p>
 * The current deposit balance is calculated from these rows. Billing-cycle
 * linked movements are editable while their billing cycle is unpaid, so clearing
 * a movement simply changes its amount to zero.
 */
@Entity
@Table(name = "deposit_movements", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DepositMovement extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "deposit_account_id", nullable = false)
    private UUID depositAccountId;

    @Column(name = "billing_cycle_id")
    private UUID billingCycleId;

    @Column(name = "billing_cycle_line_item_id")
    private UUID billingCycleLineItemId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DepositMovementType type;

    @Column(nullable = false, length = 300)
    private String reason;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    @Builder
    private DepositMovement(
            UUID depositAccountId,
            UUID billingCycleId,
            UUID billingCycleLineItemId,
            DepositMovementType type,
            String reason,
            long amountPaise,
            UUID createdByUserId) {
        validateNonNegativeAmount(amountPaise);

        this.id = UUID.randomUUID();
        this.depositAccountId = depositAccountId;
        this.billingCycleId = billingCycleId;
        this.billingCycleLineItemId = billingCycleLineItemId;
        this.type = type;
        this.reason = reason;
        this.amountPaise = amountPaise;
        this.createdByUserId = createdByUserId;
    }

    public static DepositMovement deduction(
            UUID depositAccountId,
            UUID billingCycleId,
            UUID billingCycleLineItemId,
            String reason,
            long amountPaise,
            UUID createdByUserId) {
        return DepositMovement.builder()
                .depositAccountId(depositAccountId)
                .billingCycleId(billingCycleId)
                .billingCycleLineItemId(billingCycleLineItemId)
                .type(DepositMovementType.DEDUCTION)
                .reason(reason)
                .amountPaise(amountPaise)
                .createdByUserId(createdByUserId)
                .build();
    }

    public static DepositMovement correctionDeduction(
            UUID depositAccountId,
            String reason,
            long amountPaise,
            UUID createdByUserId) {
        return DepositMovement.builder()
                .depositAccountId(depositAccountId)
                .type(DepositMovementType.DEDUCTION)
                .reason(reason)
                .amountPaise(amountPaise)
                .createdByUserId(createdByUserId)
                .build();
    }

    public static DepositMovement correctionAddition(
            UUID depositAccountId,
            String reason,
            long amountPaise,
            UUID createdByUserId) {
        return DepositMovement.builder()
                .depositAccountId(depositAccountId)
                .type(DepositMovementType.ADDITION)
                .reason(reason)
                .amountPaise(amountPaise)
                .createdByUserId(createdByUserId)
                .build();
    }

    public static DepositMovement settlement(
            UUID depositAccountId,
            String reason,
            long amountPaise,
            UUID createdByUserId) {
        return DepositMovement.builder()
                .depositAccountId(depositAccountId)
                .type(DepositMovementType.SETTLEMENT)
                .reason(reason)
                .amountPaise(amountPaise)
                .createdByUserId(createdByUserId)
                .build();
    }

    public void updateBillingLineMovement(long amountPaise, UUID adjustedByUserId) {
        ensureBillingLineMovement();
        validateNonNegativeAmount(amountPaise);

        this.amountPaise = amountPaise;
        this.createdByUserId = adjustedByUserId;
    }

    public void clearBillingLineMovement(UUID adjustedByUserId) {
        ensureBillingLineMovement();

        this.amountPaise = 0;
        this.createdByUserId = adjustedByUserId;
    }

    private void ensureBillingLineMovement() {
        if (billingCycleLineItemId == null) {
            throw new ValidationException("Only billing line deposit movements can be edited here");
        }
    }

    private static void validateNonNegativeAmount(long amountPaise) {
        if (amountPaise < 0) {
            throw new ValidationException("Deposit movement amount cannot be negative");
        }
    }
}
