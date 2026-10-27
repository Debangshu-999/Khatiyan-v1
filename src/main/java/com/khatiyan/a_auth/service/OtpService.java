package com.khatiyan.a_auth.service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

import org.springframework.dao.DataAccessException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ServiceUnavailableException;
import com.khatiyan.c_shared.exception.TooManyRequestsException;
import com.khatiyan.c_shared.valkey.ValkeyHealth;
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
    /*
     * Per number: 3 in 10 minutes AND 5 in an hour, both at once.
     *
     * Taken from Prelude's published example policy for SMS verification —
     * "three verification requests per phone number in 10 minutes and five per
     * hour, while separately limiting requests per IP" (decided 2026-09-26).
     * The two windows do different jobs. The short one stops a burst; the long
     * one stops a patient attacker, because 3 per 10 minutes alone still let
     * one number be sent 18 codes an hour, every one of them billed to us.
     *
     * Per device: 20 in 5 minutes. The published policy names no figure for
     * it, so this is the owner's own, set the same day.
     *
     * Valkey alone counts them. While it is down, codes are paused instead
     * (2026-10-18): a database fallback lost track of codes and wrong tries the
     * moment Valkey came back.
     */
    private static final int MAX_PHONE_REQUESTS_BURST = 3;
    private static final Duration PHONE_BURST_WINDOW = Duration.ofMinutes(10);
    private static final int MAX_PHONE_REQUESTS_HOURLY = 5;
    private static final Duration PHONE_HOURLY_WINDOW = Duration.ofHours(1);
    private static final int MAX_RECENT_IP_REQUESTS = 20;
    private static final Duration IP_WINDOW = Duration.ofMinutes(5);
    private static final int MAX_VERIFY_ATTEMPTS = 5;
    private static final Duration OTP_TTL = Duration.ofMinutes(10);
    /**
     * The least time between two codes to the same number for the same reason.
     *
     * <p>Long enough that an impatient second tap is refused, short enough that
     * a code which genuinely did not arrive can be sent again while the person
     * is still standing there.
     */
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(30);
    private static final String RESEND_TOO_SOON = "Please wait before requesting another code";
    static final String CODES_CANNOT_BE_SENT = "Codes can't be sent right now. Try again in a few minutes.";
    static final String CODES_CANNOT_BE_CHECKED = "Codes can't be checked right now. Try again in a few minutes.";

    private final OtpRepository otpRepository;
    private final ValkeyOtpStore valkeyOtpStore;
    private final OtpDeliveryService otpDeliveryService;
    private final PasswordEncoder passwordEncoder;
    private final ValkeyHealth valkeyHealth;
    private final SecureRandom secureRandom = new SecureRandom();

    public OtpService(
            OtpRepository otpRepository,
            ValkeyOtpStore valkeyOtpStore,
            OtpDeliveryService otpDeliveryService,
            PasswordEncoder passwordEncoder,
            ValkeyHealth valkeyHealth) {
        this.otpRepository = otpRepository;
        this.valkeyOtpStore = valkeyOtpStore;
        this.otpDeliveryService = otpDeliveryService;
        this.passwordEncoder = passwordEncoder;
        this.valkeyHealth = valkeyHealth;
    }

    @Transactional
    public void issue(String phone, String requestIpAddress, OtpPurpose purpose, OtpDeliveryChannel channel) {
        issue(phone, null, requestIpAddress, purpose, channel);
    }

    @Transactional
    public void issue(String phone, String email, String requestIpAddress, OtpPurpose purpose, OtpDeliveryChannel channel) {
        issue(phone, email, requestIpAddress, purpose, channel, null);
    }

    /**
     * As above, with a line for the message saying what the code is for.
     *
     * @param detail shown with the code, e.g. the amount and bill a cash-payment
     *     code confirms; null for codes that explain themselves
     */
    @Transactional
    public void issue(
            String phone,
            String email,
            String requestIpAddress,
            OtpPurpose purpose,
            OtpDeliveryChannel channel,
            String detail) {
        Instant now = Instant.now();
        String otp = "%06d".formatted(secureRandom.nextInt(1_000_000));
        String otpHash = passwordEncoder.encode(otp);
        OtpDeliveryChannel resolvedChannel = resolveChannel(channel);

        // Valkey alone counts and holds codes. While it is down, codes are
        // paused (2026-10-18): the database fallback this replaced kept its own
        // count, and lost track of codes and wrong tries when Valkey returned.
        if (!valkeyHealth.available()) {
            throw new ServiceUnavailableException(CODES_CANNOT_BE_SENT);
        }
        try {
            enforceValkeyLimits(phone, requestIpAddress, purpose);
            valkeyOtpStore.saveOtp(phone, purpose, otpHash, now, OTP_TTL);
        } catch (DataAccessException e) {
            valkeyHealth.failed(e);
            throw new ServiceUnavailableException(CODES_CANNOT_BE_SENT);
        }

        saveDatabaseMirror(phone, requestIpAddress, purpose, otpHash, now);
        otpDeliveryService.deliverOtp(phone, email, otp, purpose, resolvedChannel, detail);

        log.info("OTP issued using Valkey phone={} purpose={} channel={}", phone, purpose, resolvedChannel);
    }

    @Transactional
    public void verifyAndConsumeOTP(String phone, OtpPurpose purpose, String otp) {
        if (!valkeyHealth.available()) {
            throw new ServiceUnavailableException(CODES_CANNOT_BE_CHECKED);
        }
        try {
            verifyUsingValkey(phone, purpose, otp, true);
            log.info("OTP verified and consumed using Valkey phone={} purpose={}", phone, purpose);
        } catch (DataAccessException e) {
            valkeyHealth.failed(e);
            throw new ServiceUnavailableException(CODES_CANNOT_BE_CHECKED);
        }
    }

    @Transactional
    public void verifyOTPWithoutConsuming(String phone, OtpPurpose purpose, String otp) {
        if (!valkeyHealth.available()) {
            throw new ServiceUnavailableException(CODES_CANNOT_BE_CHECKED);
        }
        try {
            verifyUsingValkey(phone, purpose, otp, false);
            log.info("OTP verified without consuming using Valkey phone={} purpose={}", phone, purpose);
        } catch (DataAccessException e) {
            valkeyHealth.failed(e);
            throw new ServiceUnavailableException(CODES_CANNOT_BE_CHECKED);
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

    /**
     * The three rules, asked of Valkey.
     *
     * <p>Cooldown first and set-if-absent, so a double tap cannot slip two codes
     * through, and so a request refused for coming too soon does not also spend
     * one of the phone's or the device's allowance for the window.
     *
     * <p>Every refusal carries the seconds remaining, so the screen can count
     * down and re-enable itself. "Try again later" leaves somebody tapping a
     * button to discover whether later has arrived.
     */
    private void enforceValkeyLimits(String phone, String requestIpAddress, OtpPurpose purpose) {
        if (!valkeyOtpStore.startResendCooldown(phone, purpose, RESEND_COOLDOWN)) {
            throw new TooManyRequestsException(
                    RESEND_TOO_SOON,
                    valkeyOtpStore.resendCooldownRemainingSeconds(phone, purpose));
        }

        // Both windows are counted before either is judged, so a refusal
        // reports the LONGER wait when both are exceeded. Reporting the burst
        // window's few minutes first sent the person away only to be refused
        // again, for the rest of the hour, when they came back.
        long burstCount = valkeyOtpStore.incrementRequestCount(phone, PHONE_BURST_WINDOW);
        long hourlyCount = valkeyOtpStore.incrementHourlyRequestCount(phone, PHONE_HOURLY_WINDOW);
        long phoneWait = Math.max(
                burstCount > MAX_PHONE_REQUESTS_BURST ? valkeyOtpStore.requestWindowRemainingSeconds(phone) : 0L,
                hourlyCount > MAX_PHONE_REQUESTS_HOURLY ? valkeyOtpStore.hourlyRequestWindowRemainingSeconds(phone) : 0L);
        if (burstCount > MAX_PHONE_REQUESTS_BURST || hourlyCount > MAX_PHONE_REQUESTS_HOURLY) {
            throw new TooManyRequestsException("Too many requests", phoneWait);
        }

        if (requestIpAddress == null || requestIpAddress.isBlank()) {
            return;
        }
        long ipCount = valkeyOtpStore.incrementIpRequestCount(requestIpAddress, IP_WINDOW);
        if (ipCount > MAX_RECENT_IP_REQUESTS) {
            throw new TooManyRequestsException(
                    "Too many requests from this device",
                    valkeyOtpStore.ipRequestWindowRemainingSeconds(requestIpAddress));
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
