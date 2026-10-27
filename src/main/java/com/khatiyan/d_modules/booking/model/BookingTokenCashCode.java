package com.khatiyan.d_modules.booking.model;

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
 * A cash code that was sent for a booking token, and what it was sent for.
 *
 * <p>The code itself lives in the OTP store, keyed by phone, and knows nothing
 * about bookings. This row ties it to one token at one amount, the way
 * billing's cash code is tied to one bill.
 */
@Entity
@Table(name = "token_cash_codes", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingTokenCashCode extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "token_id", nullable = false, updatable = false)
    private UUID tokenId;

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

    /** Used, or retired because a newer code went to the same number. */
    @Column(name = "consumed_at")
    private Instant consumedAt;

    public static BookingTokenCashCode sent(UUID tokenId, long amountPaise, String phone, UUID requestedByUserId,
            Instant requestedAt, Duration lifetime) {
        BookingTokenCashCode code = new BookingTokenCashCode();
        code.id = UUID.randomUUID();
        code.tokenId = tokenId;
        code.amountPaise = amountPaise;
        code.phone = phone;
        code.requestedByUserId = requestedByUserId;
        code.requestedAt = requestedAt;
        code.expiresAt = requestedAt.plus(lifetime);
        return code;
    }

    public boolean isUsableAt(Instant now) {
        return consumedAt == null && now.isBefore(expiresAt);
    }

    public void consume(Instant now) {
        this.consumedAt = now;
    }

    /** Retired because a newer code went to the same number, and the OTP store has replaced it. */
    public void supersede(Instant now) {
        this.consumedAt = now;
    }
}
