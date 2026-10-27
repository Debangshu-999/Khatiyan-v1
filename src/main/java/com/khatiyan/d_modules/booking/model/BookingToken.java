package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

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
 * A booking's token: what each side says about money that never passes
 * through the app. The tenant pays the property directly, and this row records
 * the receipt and how it ended. A refund owed is recorded, never followed:
 * the refund columns are from before 2026-10-28 and are no longer written.
 *
 * <p>It exists only where a token is owed, written when terms are agreed at a
 * property that takes one. Its clock is not here: the deadline and whether a
 * claim is waiting stay on the request, where the lists and the sweep read
 * them.
 *
 * <p>This class records facts. Whether a step is allowed is
 * {@code BookingTokenRules}' business, asked by the service before it calls
 * anything here.
 */
@Entity
@Table(name = "tokens", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingToken extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /** What was owed when terms were agreed. It never changes. */
    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingTokenStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "received_method", length = 20)
    private ManualPaymentMethod receivedMethod;

    @Column(name = "received_reference", length = 60)
    private String receivedReference;

    @Column(name = "received_by_user_id")
    private UUID receivedByUserId;

    @Column(name = "received_at")
    private Instant receivedAt;

    /** The receipt's short code, shown to both sides. */
    @Column(name = "receipt_code", length = 40)
    private String receiptCode;

    @Column(name = "waived_by_user_id")
    private UUID waivedByUserId;

    @Column(name = "waived_at")
    private Instant waivedAt;

    /**
     * Since when the property has owed it back. A refund the tenant says did
     * not arrive keeps its first date, so "sent" cannot restart the count.
     */
    @Column(name = "refund_due_since")
    private Instant refundDueSince;

    @Enumerated(EnumType.STRING)
    @Column(name = "refund_method", length = 20)
    private ManualPaymentMethod refundMethod;

    @Column(name = "refund_reference", length = 60)
    private String refundReference;

    @Column(name = "refund_proof_url", length = 500)
    private String refundProofUrl;

    @Column(name = "refund_sent_by_user_id")
    private UUID refundSentByUserId;

    @Column(name = "refund_sent_at")
    private Instant refundSentAt;

    @Column(name = "refund_confirmed_at")
    private Instant refundConfirmedAt;

    @Column(name = "refund_disputed_at")
    private Instant refundDisputedAt;

    /** Terms were agreed at a property that takes a token. */
    public static BookingToken due(UUID requestId, UUID propertyId, long amountPaise) {
        if (amountPaise <= 0) {
            throw new IllegalArgumentException("A token that is owed has an amount");
        }
        BookingToken token = new BookingToken();
        token.id = UUID.randomUUID();
        token.requestId = requestId;
        token.propertyId = propertyId;
        token.amountPaise = amountPaise;
        token.status = BookingTokenStatus.DUE;
        return token;
    }

    /** The tenant says they paid. */
    public void claim() {
        this.status = BookingTokenStatus.CLAIMED;
    }

    /** The property says the claimed payment did not arrive. It is still owed. */
    public void refuseClaim() {
        this.status = BookingTokenStatus.NOT_RECEIVED;
    }

    /**
     * The property says the money arrived.
     *
     * @param next RECEIVED while the booking is held. Where the booking has
     *             already ended, how the money settles straight away
     */
    public void receive(BookingTokenStatus next, ManualPaymentMethod method, String reference, UUID byUserId,
            Instant at, String receiptCode) {
        if (receivedAt != null) {
            throw new IllegalStateException("A token is received once");
        }
        this.receivedMethod = method;
        this.receivedReference = reference;
        this.receivedByUserId = byUserId;
        this.receivedAt = at;
        this.receiptCode = receiptCode;
        move(next, at);
    }

    /** The owner holds this bed without a token after all. */
    public void waive(UUID ownerUserId, Instant at) {
        this.status = BookingTokenStatus.NOT_REQUIRED;
        this.waivedByUserId = ownerUserId;
        this.waivedAt = at;
    }

    /** The booking ended, or the tenant moved in, with the money in the property's hands. */
    public void settle(BookingTokenStatus next, Instant at) {
        move(next, at);
    }

    private void move(BookingTokenStatus next, Instant at) {
        this.status = next;
        if (next == BookingTokenStatus.REFUND_DUE && refundDueSince == null) {
            this.refundDueSince = at;
        }
    }
}
