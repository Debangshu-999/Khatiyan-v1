package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.DepositMovement;
import com.khatiyan.d_modules.billing.model.DepositMovementType;

/**
 * One deposit ledger movement.
 */
public record DepositMovementResponse(
    UUID id,
    UUID depositAccountId,
    UUID billingCycleId,
    UUID billingCycleLineItemId,
    DepositMovementType type,
    String reason,
    long amountPaise,
    UUID createdByUserId,
    Instant createdAt
) {
    public static DepositMovementResponse from(DepositMovement movement) {
        return new DepositMovementResponse(
            movement.getId(),
            movement.getDepositAccountId(),
            movement.getBillingCycleId(),
            movement.getBillingCycleLineItemId(),
            movement.getType(),
            movement.getReason(),
            movement.getAmountPaise(),
            movement.getCreatedByUserId(),
            movement.getCreatedAt()
        );
    }
}
