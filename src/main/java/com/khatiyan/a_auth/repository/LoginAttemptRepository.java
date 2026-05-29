package com.khatiyan.a_auth.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.a_auth.model.LoginAttempt;

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
}
