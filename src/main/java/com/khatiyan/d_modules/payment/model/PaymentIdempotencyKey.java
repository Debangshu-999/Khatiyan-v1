package com.khatiyan.d_modules.payment.model;

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
 * Stores a client idempotency key for one payment operation.
 *
 * <p>
 * The unique key is {@code user_id + operation + idempotency_key}. A retry with
 * the same request hash returns the original result; the same key with a
 * different request hash is rejected because it means the client reused the key
 * for a different action.
 */
@Entity
@Table(name = "payment_idempotency_keys", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentIdempotencyKey extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 80)
    private String operation;

    @Column(name = "idempotency_key", nullable = false, length = 120)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentIdempotencyStatus status;

    @Column(name = "payment_order_id")
    private UUID paymentOrderId;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    public void assertSameRequest(String incomingRequestHash) {
        if (!this.requestHash.equals(incomingRequestHash)) {
            throw new ValidationException("Idempotency key was already used for a different request");
        }
    }

    public void markCompleted(UUID paymentOrderId, Instant completedAt) {
        if (paymentOrderId == null) {
            throw new ValidationException("Payment order id is required for idempotency completion");
        }

        this.status = PaymentIdempotencyStatus.COMPLETED;
        this.paymentOrderId = paymentOrderId;
        this.completedAt = completedAt;
        this.failedAt = null;
        this.failureReason = null;
    }

    public void markFailed(String failureReason, Instant failedAt) {
        this.status = PaymentIdempotencyStatus.FAILED;
        this.failedAt = failedAt;
        this.failureReason = failureReason;
    }
}
