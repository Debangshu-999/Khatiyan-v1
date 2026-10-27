package com.khatiyan.a_auth.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.a_auth.model.LoginAttempt;
import com.khatiyan.a_auth.model.LoginFailureReason;

/**
 * Persistence access for PIN login attempt records.
 *
 * <p>These queries power the restart-safe login rate limiter by counting
 * recent failed attempts for a phone number and client IP.
 */
@Repository
public interface LoginAttemptRepository extends JpaRepository<LoginAttempt, UUID> {

    @Query("""
            SELECT COUNT(attempt)
            FROM LoginAttempt attempt
            WHERE attempt.phone = :phone
              AND attempt.successful = false
              AND attempt.createdAt > :since
            """)
    long countFailedByPhoneSince(String phone, Instant since);

    @Query("""
            SELECT COUNT(attempt)
            FROM LoginAttempt attempt
            WHERE attempt.ipAddress = :ipAddress
              AND attempt.successful = false
              AND attempt.createdAt > :since
            """)
    long countFailedByIpSince(String ipAddress, Instant since);

    /**
     * When a phone's counted failures happened since its last successful login,
     * newest first (2026-10-18).
     *
     * <p>The progressive phone lock is worked out from these, so it needs no
     * store of its own. A failure followed by a later success no longer counts,
     * which is how a successful login clears the tally. Read on the
     * {@code (phone, created_at DESC)} index.
     */
    @Query("""
            SELECT attempt.createdAt
            FROM LoginAttempt attempt
            WHERE attempt.phone = :phone
              AND attempt.successful = false
              AND attempt.failureReason IN :reasons
              AND NOT EXISTS (
                  SELECT 1 FROM LoginAttempt success
                  WHERE success.phone = attempt.phone
                    AND success.successful = true
                    AND success.createdAt > attempt.createdAt)
            ORDER BY attempt.createdAt DESC
            """)
    List<Instant> findFailureTimesSinceLastSuccess(
            String phone, Collection<LoginFailureReason> reasons, Pageable page);
}
