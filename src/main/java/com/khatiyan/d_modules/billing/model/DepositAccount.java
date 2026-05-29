package com.khatiyan.d_modules.billing.model;

import java.time.Instant;
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
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Deposit account identity for a monthly tenancy.
 *
 * <p>
 * The account does not cache balance. Deposit balance is calculated from
 * {@link DepositMovement} rows, like a small ledger.
 */
@Entity
@Table(name = "deposit_accounts", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DepositAccount extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DepositAccountStatus status;

    @Column(name = "settled_at")
    private Instant settledAt;

    private DepositAccount(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId) {
        this.id = UUID.randomUUID();
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.status = DepositAccountStatus.ACTIVE;
    }

    public static DepositAccount open(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId) {
        return new DepositAccount(tenancyId, tenantUserId, propertyId);
    }

    public void settle(Instant settledAt) {
        ensureActive();

        this.status = DepositAccountStatus.SETTLED;
        this.settledAt = settledAt;
    }

    private void ensureActive() {
        if (status != DepositAccountStatus.ACTIVE) {
            throw new ValidationException("Deposit account is not active");
        }
    }

}
