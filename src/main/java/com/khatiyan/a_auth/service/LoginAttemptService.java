package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.model.LoginAttempt;
import com.khatiyan.a_auth.model.LoginFailureReason;
import com.khatiyan.a_auth.repository.LoginAttemptRepository;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Durable login attempt limiter and recorder.
 *
 * <p>This service checks recent DB-backed phone/IP windows before PIN matching
 * and records outcomes in separate transactions so failed login responses do
 * not erase their own audit/rate-limit records.
 */
@Service
public class LoginAttemptService {

    private final LoginAttemptRepository loginAttemptRepository;
    private final LoginRateLimitProperties properties;

    public LoginAttemptService(
            LoginAttemptRepository loginAttemptRepository,
            LoginRateLimitProperties properties) {
        this.loginAttemptRepository = loginAttemptRepository;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public void checkDurableWindow(String phone, String ipAddress) {
        Instant phoneSince = Instant.now().minus(Duration.ofMinutes(properties.phoneLimitDurationMinutes()));
        long phoneFailures = loginAttemptRepository.countFailedByPhoneSince(phone, phoneSince);
        if (phoneFailures >= properties.phoneLimitAttempts()) {
            throw new ValidationException("Too many login attempts for this phone. Try again later.");
        }

        if (ipAddress == null || ipAddress.isBlank()) {
            return;
        }

        Instant ipSince = Instant.now().minus(Duration.ofMinutes(properties.ipLimitDurationMinutes()));
        long ipFailures = loginAttemptRepository.countFailedByIpSince(ipAddress, ipSince);
        if (ipFailures >= properties.ipLimitAttempts()) {
            throw new ValidationException("Too many login attempts from this device. Try again later.");
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSuccess(String phone, String ipAddress) {
        loginAttemptRepository.save(LoginAttempt.success(phone, ipAddress));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(String phone, String ipAddress, LoginFailureReason reason) {
        loginAttemptRepository.save(LoginAttempt.failure(phone, ipAddress, reason));
    }
}
