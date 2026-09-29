package com.khatiyan.d_modules.billing.model;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A cash-payment confirmation code that was sent, and what it was sent FOR.
 *
 * <p>The code itself lives in the OTP store, keyed by phone and purpose — it
 * knows nothing about bills. This row is what ties it to one bill at one
 * amount, so a code sent while the bill read ₹21,600 cannot be used to record
 * it after a late fee has made it ₹22,200. The tenant confirmed the first
 * number, not the second.
 */
@Entity
@Table(name = "cash_payment_codes", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CashPaymentCode extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "billing_cycle_id", nullable = false, updatable = false)
    private UUID billingCycleId;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    @Column(nullable = false, updatable = false, length = 20)
    private String phone;

    @Column(name = "requested_by_user_id", nullable = false, updatable = false)
    private UUID requestedByUserId;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    private CashPaymentCode(
            UUID billingCycleId,
            long amountPaise,
            String phone,
            UUID requestedByUserId,
            Instant requestedAt,
            Duration lifetime) {
        this.id = UUID.randomUUID();
        this.billingCycleId = billingCycleId;
        this.amountPaise = amountPaise;
        this.phone = phone;
        this.requestedByUserId = requestedByUserId;
        this.requestedAt = requestedAt;
        this.expiresAt = requestedAt.plus(lifetime);
    }

    public static CashPaymentCode sent(
            UUID billingCycleId,
            long amountPaise,
            String phone,
            UUID requestedByUserId,
            Instant requestedAt,
            Duration lifetime) {
        return new CashPaymentCode(billingCycleId, amountPaise, phone, requestedByUserId, requestedAt, lifetime);
    }

    public boolean isUsableAt(Instant now) {
        return consumedAt == null && now.isBefore(expiresAt);
    }

    public void consume(Instant now) {
        this.consumedAt = now;
    }

    /**
     * Retired because a newer code went to the same number.
     *
     * <p>Recorded in the same column as a use, because either way the answer to
     * "can this still be entered?" is no — and the OTP store has already
     * replaced the code it described.
     */
    public void supersede(Instant now) {
        this.consumedAt = now;
    }
}
