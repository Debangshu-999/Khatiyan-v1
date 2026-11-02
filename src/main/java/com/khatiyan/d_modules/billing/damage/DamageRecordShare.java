package com.khatiyan.d_modules.billing.damage;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * The tenant a damage record names, what they answer for and its one-off bill,
 * once charged. Kept as recorded, so a tenant who moves in later never inherits
 * it. A record has one of these at most: a split is a record per tenant.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DamageRecordShare {

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id")
    private UUID tenantUserId;

    @Column(name = "tenant_name", nullable = false, length = 120)
    private String tenantName;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "bill_id")
    private UUID billId;

    /** Waived at checkout, for good. The damage itself stays open for repair. */
    @Column(name = "waived", nullable = false)
    private boolean waived;

    /** How much of it came off the deposit: at checkout, or from a Damage bill (2026-10-31). */
    @Column(name = "deposit_paise", nullable = false)
    private long depositPaise;

    public DamageRecordShare(UUID tenancyId, UUID tenantUserId, String tenantName, long amountPaise) {
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.tenantName = tenantName;
        this.amountPaise = amountPaise;
    }

    void billedAs(UUID billId) {
        this.billId = billId;
    }

    void unbill() {
        this.billId = null;
    }

    void waive() {
        this.waived = true;
    }

    void tookFromDeposit(long paise) {
        this.depositPaise = paise;
    }

    /** Nothing more can be done with it: the deposit covered it, or it was waived. */
    boolean settledWithoutABill() {
        return waived || (amountPaise > 0 && depositPaise >= amountPaise);
    }
}
