package com.khatiyan.d_modules.payment.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.PaymentIdempotencyKey;

/**
 * Persistence access for payment idempotency keys.
 *
 * <p>
 * The native insert uses PostgreSQL {@code ON CONFLICT DO NOTHING} so
 * concurrent
 * duplicate requests do not create two claimed rows.
 */
@Repository
public interface PaymentIdempotencyKeyRepository extends JpaRepository<PaymentIdempotencyKey, UUID> {

        @Modifying
        @Query(value = """
                        INSERT INTO payment.payment_idempotency_keys (
                            id,
                            user_id,
                            operation,
                            idempotency_key,
                            request_hash,
                            status,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :id,
                            :userId,
                            :operation,
                            :idempotencyKey,
                            :requestHash,
                            'PROCESSING',
                            :now,
                            :now
                        )
                        ON CONFLICT (user_id, operation, idempotency_key) DO NOTHING
                        """, nativeQuery = true)
        int insertProcessingClaim(
                        UUID id,
                        UUID userId,
                        String operation,
                        String idempotencyKey,
                        String requestHash,
                        Instant now);

        @Query("""
                        SELECT idempotencyKey
                        FROM PaymentIdempotencyKey idempotencyKey
                        WHERE idempotencyKey.userId = :userId
                          AND idempotencyKey.operation = :operation
                          AND idempotencyKey.idempotencyKey = :idempotencyKey
                        """)
        Optional<PaymentIdempotencyKey> findByUserOperationAndKey(
                        UUID userId,
                        String operation,
                        String idempotencyKey);
}
