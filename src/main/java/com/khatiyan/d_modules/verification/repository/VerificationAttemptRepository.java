package com.khatiyan.d_modules.verification.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.verification.model.VerificationAttempt;
import com.khatiyan.d_modules.verification.model.VerificationAttemptStatus;

public interface VerificationAttemptRepository extends JpaRepository<VerificationAttempt, UUID> {

    List<VerificationAttempt> findByGrantIdOrderByStartedAtDesc(UUID grantId);

    Optional<VerificationAttempt> findByProviderReference(String providerReference);

    /**
     * How many times this tenant has actually been VERIFIED against today.
     *
     * <p>Charged attempts only. An attempt the provider refused before sending
     * anything cost nobody a rupee and reached nobody's phone — counting it
     * would mean a tenant losing their day because our integration was
     * misconfigured, which is exactly what happened. Hammering is held back by
     * the resend cooldown, which is the right tool for it.
     */
    long countByGrantIdAndChargedAtNotNullAndStartedAtAfter(UUID grantId, Instant since);

    /** The sweep's input: codes nobody ever typed. */
    List<VerificationAttempt> findByStatusAndOtpExpiresAtBefore(
            VerificationAttemptStatus status, Instant before);
}
