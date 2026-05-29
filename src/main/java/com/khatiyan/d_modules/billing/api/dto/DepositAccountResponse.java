package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;

/**
 * Current deposit balance plus ledger history.
 */
public record DepositAccountResponse(
    UUID id,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    long currentBalancePaise,
    DepositAccountStatus status,
    Instant settledAt,
    Instant createdAt,
    Instant updatedAt,
    List<DepositMovementResponse> movements
) {
    public static DepositAccountResponse from(
            DepositAccount account,
            long currentBalancePaise,
            List<DepositMovementResponse> movements) {
        return new DepositAccountResponse(
            account.getId(),
            account.getTenancyId(),
            account.getTenantUserId(),
            account.getPropertyId(),
            currentBalancePaise,
            account.getStatus(),
            account.getSettledAt(),
            account.getCreatedAt(),
            account.getUpdatedAt(),
            movements
        );
    }
}
