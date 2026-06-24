package com.khatiyan.a_auth.service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

import org.springframework.dao.DataAccessException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.model.OtpRequest;
import com.khatiyan.a_auth.repository.OtpRepository;
import com.khatiyan.a_auth.service.ValkeyOtpStore.ValkeyOtp;
import com.khatiyan.c_shared.exception.ValidationException;

import lombok.extern.slf4j.Slf4j;

@SuppressWarnings("null")
@Slf4j
@Service
public class OtpService {
    private static final int MAX_RECENT_REQUESTS = 3;
    private static final int MAX_RECENT_IP_REQUESTS = 20;
    private static final int MAX_VERIFY_ATTEMPTS = 5;
    private static final Duration RATE_LIMIT_WINDOW = Duration.ofMinutes(15);
    private static final Duration OTP_TTL = Duration.ofMinutes(10);

    private final OtpRepository otpRepository;
    private final ValkeyOtpStore valkeyOtpStore;
    private final OtpDeliveryService otpDeliveryService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public OtpService(
            OtpRepository otpRepository,
            ValkeyOtpStore valkeyOtpStore,
            OtpDeliveryService otpDeliveryService,
            PasswordEncoder passwordEncoder) {
        this.otpRepository = otpRepository;
        this.valkeyOtpStore = valkeyOtpStore;
        this.otpDeliveryService = otpDeliveryService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public void issue(String phone, String requestIpAddress, OtpPurpose purpose, OtpDeliveryChannel channel) {
        issue(phone, null, requestIpAddress, purpose, channel);
    }

    @Transactional
    public void issue(String phone, String email, String requestIpAddress, OtpPurpose purpose, OtpDeliveryChannel channel) {
        Instant now = Instant.now();
        String otp = "%06d".formatted(secureRandom.nextInt(1_000_000));
        String otpHash = passwordEncoder.encode(otp);
        OtpDeliveryChannel resolvedChannel = resolveChannel(channel);

        checkDatabaseIssueRateLimit(phone, requestIpAddress, now);

        try {
            long requestCount = valkeyOtpStore.incrementRequestCount(phone, RATE_LIMIT_WINDOW);
            if (requestCount > MAX_RECENT_REQUESTS) {
                throw new ValidationException("Too many OTP requests. Please try again later");
            }

            valkeyOtpStore.saveOtp(phone, purpose, otpHash, now, OTP_TTL);
        } catch (DataAccessException e) {
            log.warn(
                    "Valkey unavailable during OTP issue. Falling back to database phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());

            issueUsingDatabase(phone, email, requestIpAddress, purpose, otpHash, otp, now, resolvedChannel);
            return;
        }

        saveDatabaseMirror(phone, requestIpAddress, purpose, otpHash, now);
        otpDeliveryService.deliverOtp(phone, email, otp, purpose, resolvedChannel);

        log.info("OTP issued using Valkey phone={} purpose={} channel={}", phone, purpose, resolvedChannel);
    }

    @Transactional
    public void verifyAndConsumeOTP(String phone, OtpPurpose purpose, String otp) {
        try {
            verifyUsingValkey(phone, purpose, otp, true);
            log.info("OTP verified and consumed using Valkey phone={} purpose={}", phone, purpose);
        } catch (DataAccessException e) {
            log.warn(
                    "Valkey unavailable during OTP consume verification. Falling back to database phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());

            verifyAndConsumeUsingDatabase(phone, purpose, otp);
        }
    }

    @Transactional
    public void verifyOTPWithoutConsuming(String phone, OtpPurpose purpose, String otp) {
        try {
            verifyUsingValkey(phone, purpose, otp, false);
            log.info("OTP verified without consuming using Valkey phone={} purpose={}", phone, purpose);
        } catch (DataAccessException e) {
            log.warn(
                    "Valkey unavailable during OTP non-consuming verification. Falling back to database phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());

            verifyWithoutConsumingUsingDatabase(phone, purpose, otp);
        }
    }

    private void issueUsingDatabase(
            String phone,
            String email,
            String requestIpAddress,
            OtpPurpose purpose,
            String otpHash,
            String otp,
            Instant now,
            OtpDeliveryChannel channel) {
        saveDatabaseOtp(phone, requestIpAddress, purpose, otpHash, now);
        otpDeliveryService.deliverOtp(phone, email, otp, purpose, channel);

        log.info("OTP issued using database fallback phone={} purpose={} channel={}", phone, purpose, channel);
    }

    private void verifyAndConsumeUsingDatabase(String phone, OtpPurpose purpose, String otp) {
        OtpRequest request = otpRepository.findLatestUsable(phone, purpose, Instant.now(), MAX_VERIFY_ATTEMPTS)
                .orElseThrow(() -> new ValidationException("OTP is invalid or expired"));

        if (!passwordEncoder.matches(otp, request.getOtpHash())) {
            request.recordFailedAttempt();  
            throw new ValidationException("OTP is invalid or expired");
        }

        request.consume(Instant.now());
    }

    private void verifyWithoutConsumingUsingDatabase(String phone, OtpPurpose purpose, String otp) {
        OtpRequest request = otpRepository.findLatestUsable(
                phone,
                purpose,
                Instant.now(),
                MAX_VERIFY_ATTEMPTS
            )
            .orElseThrow(() -> new ValidationException("OTP is invalid or expired"));

        if (!passwordEncoder.matches(otp, request.getOtpHash())) {
            request.recordFailedAttempt();
            throw new ValidationException("OTP is invalid or expired");
        }
    }

    private void verifyUsingValkey(String phone, OtpPurpose purpose, String otp, boolean consume) {
        Instant now = Instant.now();

        ValkeyOtp request = valkeyOtpStore.findOtp(phone, purpose)
                .orElseThrow(() -> new ValidationException("OTP is invalid or expired"));

        if (request.expiresAt().isBefore(now) || request.attempts() >= MAX_VERIFY_ATTEMPTS) {
            throw new ValidationException("OTP is invalid or expired");
        }

        if (!passwordEncoder.matches(otp, request.otpHash())) {
            valkeyOtpStore.recordFailedAttempt(phone, purpose);
            recordDatabaseFailedAttempt(phone, purpose);
            throw new ValidationException("OTP is invalid or expired");
        }

        if (consume) {
            valkeyOtpStore.consumeOtp(phone, purpose);
            consumeDatabaseOtp(phone, purpose, otp);
        }
    }

    private void saveDatabaseOtp(
            String phone,
            String requestIpAddress,
            OtpPurpose purpose,
            String otpHash,
            Instant now) {
        OtpRequest request = OtpRequest.issue(phone, requestIpAddress, purpose, otpHash, now.plus(OTP_TTL));
        otpRepository.save(request);
    }

    private void saveDatabaseMirror(
            String phone,
            String requestIpAddress,
            OtpPurpose purpose,
            String otpHash,
            Instant now) {
        try {
            saveDatabaseOtp(phone, requestIpAddress, purpose, otpHash, now);
        } catch (DataAccessException e) {
            log.warn(
                    "Database OTP mirror failed after Valkey write. Continuing with Valkey OTP phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());
        }
    }

    private void checkDatabaseIssueRateLimit(String phone, String requestIpAddress, Instant now) {
        Instant since = now.minus(RATE_LIMIT_WINDOW);
        long recentPhoneOtpCount = otpRepository.countByPhoneAndCreatedAtAfter(phone, since);

        if (recentPhoneOtpCount >= MAX_RECENT_REQUESTS) {
            throw new ValidationException("Too many OTP requests. Please try again later");
        }

        if (requestIpAddress == null || requestIpAddress.isBlank()) {
            return;
        }

        long recentIpOtpCount = otpRepository.countByRequestIpAddressAndCreatedAtAfter(requestIpAddress, since);
        if (recentIpOtpCount >= MAX_RECENT_IP_REQUESTS) {
            throw new ValidationException("Too many OTP requests from this device. Please try again later");
        }
    }

    private void recordDatabaseFailedAttempt(String phone, OtpPurpose purpose) {
        try {
            otpRepository.findLatestUsable(phone, purpose, Instant.now(), MAX_VERIFY_ATTEMPTS)
                    .ifPresent(request -> request.recordFailedAttempt());
        } catch (RuntimeException e) {
            log.warn(
                    "Database OTP attempt sync failed phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());
        }
    }

    private void consumeDatabaseOtp(String phone, OtpPurpose purpose, String otp) {
        try {
            otpRepository.findLatestUsable(phone, purpose, Instant.now(), MAX_VERIFY_ATTEMPTS)
                    .filter(request -> passwordEncoder.matches(otp, request.getOtpHash()))
                    .ifPresent(request -> request.consume(Instant.now()));
        } catch (RuntimeException e) {
            log.warn(
                    "Database OTP consume sync failed phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());
        }
    }

    private OtpDeliveryChannel resolveChannel(OtpDeliveryChannel channel) {
        if (channel == null) {
            return OtpDeliveryChannel.SMS;
        }

        return channel;
    }
}
