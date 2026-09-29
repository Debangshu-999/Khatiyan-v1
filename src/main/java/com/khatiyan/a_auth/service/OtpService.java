package com.khatiyan.a_auth.service;

import java.util.Optional;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

import org.springframework.dao.DataAccessException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.TooManyRequestsException;
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
     * The same numbers in Valkey and in the database fallback, so which one
     * answers makes no difference to the person asking.
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

        // ONE limiter answers each request: Valkey while it is up, the database
        // only when it is not. Both used to run on every request, so a code was
        // refused by whichever tripped first, and the database — counting rows
        // on every send — was doing work Valkey had already done. Both apply
        // the same three rules, so which one answered makes no difference to
        // the person asking.
        try {
            enforceValkeyLimits(phone, requestIpAddress, purpose);
            valkeyOtpStore.saveOtp(phone, purpose, otpHash, now, OTP_TTL);
        } catch (DataAccessException e) {
            log.warn(
                    "Valkey unavailable during OTP issue. Falling back to database phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());

            enforceDatabaseLimits(phone, requestIpAddress, purpose, now);
            issueUsingDatabase(phone, email, requestIpAddress, purpose, otpHash, otp, now, resolvedChannel, detail);
            return;
        }

        saveDatabaseMirror(phone, requestIpAddress, purpose, otpHash, now);
        otpDeliveryService.deliverOtp(phone, email, otp, purpose, resolvedChannel, detail);

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
            OtpDeliveryChannel channel,
            String detail) {
        saveDatabaseOtp(phone, requestIpAddress, purpose, otpHash, now);
        otpDeliveryService.deliverOtp(phone, email, otp, purpose, channel, detail);

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

    /**
     * The same three rules, answered from the rows the database already keeps.
     *
     * <p>Only reached when Valkey could not be asked. Those rows are written on
     * every send, Valkey path included (see {@code saveDatabaseMirror}), so the
     * counts here are the true ones even for codes Valkey issued before it went
     * down.
     */
    private void enforceDatabaseLimits(String phone, String requestIpAddress, OtpPurpose purpose, Instant now) {
        otpRepository.findFirstByPhoneAndPurposeOrderByCreatedAtDesc(phone, purpose)
                .map(latest -> latest.getCreatedAt().plus(RESEND_COOLDOWN))
                .filter(cooldownEnds -> cooldownEnds.isAfter(now))
                .ifPresent(cooldownEnds -> {
                    throw new TooManyRequestsException(
                            RESEND_TOO_SOON,
                            Math.max(1L, Duration.between(now, cooldownEnds).toSeconds()));
                });

        // The same two windows. The longer wait wins when both are full, for
        // the same reason as on the Valkey side.
        Instant burstSince = now.minus(PHONE_BURST_WINDOW);
        Instant hourlySince = now.minus(PHONE_HOURLY_WINDOW);
        boolean burstFull = otpRepository.countByPhoneAndCreatedAtAfter(phone, burstSince) >= MAX_PHONE_REQUESTS_BURST;
        boolean hourlyFull = otpRepository.countByPhoneAndCreatedAtAfter(phone, hourlySince) >= MAX_PHONE_REQUESTS_HOURLY;
        if (burstFull || hourlyFull) {
            long burstWait = burstFull
                    ? secondsUntilWindowFrees(
                            otpRepository.findFirstByPhoneAndCreatedAtAfterOrderByCreatedAtAsc(phone, burstSince),
                            now,
                            PHONE_BURST_WINDOW)
                    : 0L;
            long hourlyWait = hourlyFull
                    ? secondsUntilWindowFrees(
                            otpRepository.findFirstByPhoneAndCreatedAtAfterOrderByCreatedAtAsc(phone, hourlySince),
                            now,
                            PHONE_HOURLY_WINDOW)
                    : 0L;
            throw new TooManyRequestsException("Too many requests", Math.max(burstWait, hourlyWait));
        }

        if (requestIpAddress == null || requestIpAddress.isBlank()) {
            return;
        }

        Instant ipSince = now.minus(IP_WINDOW);
        long recentIpOtpCount = otpRepository.countByRequestIpAddressAndCreatedAtAfter(requestIpAddress, ipSince);
        if (recentIpOtpCount >= MAX_RECENT_IP_REQUESTS) {
            throw new TooManyRequestsException(
                    "Too many requests from this device",
                    secondsUntilWindowFrees(
                            otpRepository.findFirstByRequestIpAddressAndCreatedAtAfterOrderByCreatedAtAsc(
                                    requestIpAddress, ipSince),
                            now,
                            IP_WINDOW));
        }
    }

    /**
     * How long until the oldest request in the window falls out of it.
     *
     * <p>Falls back to the whole window when the row cannot be found, which
     * over-states the wait rather than under-stating it — a screen that
     * re-enables early sends the caller into a second refusal.
     */
    private static long secondsUntilWindowFrees(Optional<OtpRequest> oldest, Instant now, Duration window) {
        return oldest
                .map(request -> Duration.between(now, request.getCreatedAt().plus(window)).toSeconds())
                .filter(seconds -> seconds > 0)
                .orElse(window.toSeconds());
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
