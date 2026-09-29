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
    String tenantName,
    String tenancyReferenceCode,
    long currentBalancePaise,
    DepositAccountStatus status,
    /**
     * The end-tenancy payability decision, or null if none was recorded. Drives
     * which single action the settlement screen offers.
     */
    Boolean payableAtExit,
    Instant settledAt,
    Instant createdAt,
    Instant updatedAt,
    List<DepositMovementResponse> movements,
    /**
     * The row's version (2026-09-29). A screen sends it back as If-Match when
     * it acts, and a record changed since the screen loaded it is refused.
     */
    long version
) {
    public static DepositAccountResponse from(
            DepositAccount account,
            String tenantName,
            String tenancyReferenceCode,
            long currentBalancePaise,
            Instant lastLedgerActivityAt,
            List<DepositMovementResponse> movements) {
        return new DepositAccountResponse(
            account.getId(),
            account.getTenancyId(),
            account.getTenantUserId(),
            account.getPropertyId(),
            tenantName,
            tenancyReferenceCode,
            currentBalancePaise,
            account.getStatus(),
            account.getPayableAtExit(),
            account.getSettledAt(),
            account.getCreatedAt(),
            latest(account.getUpdatedAt(), lastLedgerActivityAt),
            movements,
            account.getVersion()
        );
    }

    private static Instant latest(Instant accountUpdatedAt, Instant lastLedgerActivityAt) {
        if (accountUpdatedAt == null) {
            return lastLedgerActivityAt;
        }
        if (lastLedgerActivityAt == null) {
            return accountUpdatedAt;
        }
        return accountUpdatedAt.isAfter(lastLedgerActivityAt) ? accountUpdatedAt : lastLedgerActivityAt;
    }
}
