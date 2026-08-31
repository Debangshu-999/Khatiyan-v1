package com.khatiyan.a_auth.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.OtpRequest;

/**
 * Persistence access for issued OTPs.
 *
 * <p>The auth service uses this repository to rate-limit OTP issuance
 * and to find the latest usable OTP for a phone plus purpose. OTPs are
 * never stored in plaintext; only hashes are persisted.
 */
@Repository
public interface OtpRepository extends JpaRepository<OtpRequest, UUID> {

    @Query("""
        SELECT o FROM OtpRequest o
        WHERE o.phone = :phone
          AND o.purpose = :purpose
          AND o.expiresAt > :now
          AND o.consumedAt IS NULL
          AND o.attempts < :maxAttempts
        ORDER BY o.createdAt DESC
        LIMIT 1
    """)
    Optional<OtpRequest> findLatestUsable(
        @Param("phone") String phone,
        @Param("purpose") OtpPurpose purpose,
        @Param("now") Instant now,
        @Param("maxAttempts") int maxAttempts
    );
    
    long countByPhoneAndCreatedAtAfter(String phone, Instant since);

    long countByRequestIpAddressAndCreatedAtAfter(String requestIpAddress, Instant since);

    /**
     * The oldest request still inside the window, for telling somebody when
     * their budget frees up.
     *
     * <p>The window is rolling: it started when this row was written, not when
     * the caller was refused, so the wait is what is left of ITS fifteen
     * minutes.
     */
    Optional<OtpRequest> findFirstByPhoneAndCreatedAtAfterOrderByCreatedAtAsc(String phone, Instant since);

    Optional<OtpRequest> findFirstByRequestIpAddressAndCreatedAtAfterOrderByCreatedAtAsc(
            String requestIpAddress, Instant since);
}
