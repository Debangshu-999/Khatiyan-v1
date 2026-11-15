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
     * Per device: 20 in an hour (user, 2026-11-14; was 20 in 5 minutes), Twilio's
     * published per-IP example. The original policy named no figure for
     * it, so this is the owner's own, set the same day.
     *
     * Valkey alone counts them. While it is down, codes are paused instead
     * (2026-10-18): a database fallback lost track of codes and wrong tries the
     * moment Valkey came back.
     */
    /*
     * The per-number limits are the resend schedule now (user, 2026-11-14),
     * kept in the database by OtpSendSchedule: 30 seconds between the first 3
     * codes in a day, then the gap doubles for every further 3. It replaced
     * 3 in 10 minutes and 5 an hour. The per-device limit below stays.
     */
    private static final int MAX_RECENT_IP_REQUESTS = 20;
    private static final Duration IP_WINDOW = Duration.ofHours(1);
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

    /** The schedule's gap, for the tests that read it from here. */
    static Duration resendGapAfter(long sent) {
        return OtpSendSchedule.gapAfter(sent);
    }
    private static final String RESEND_TOO_SOON = "Please wait before requesting another code";
    static final String CODES_CANNOT_BE_SENT = "Codes can't be sent right now. Try again in a few minutes.";
    static final String CODES_CANNOT_BE_CHECKED = "Codes can't be checked right now. Try again in a few minutes.";

    private final OtpRepository otpRepository;
    private final ValkeyOtpStore valkeyOtpStore;
    private final OtpDeliveryService otpDeliveryService;
    private final PasswordEncoder passwordEncoder;
    private final ValkeyHealth valkeyHealth;
    private final OtpSendSchedule sendSchedule;
    private final SecureRandom secureRandom = new SecureRandom();

    public OtpService(
            OtpRepository otpRepository,
            ValkeyOtpStore valkeyOtpStore,
            OtpDeliveryService otpDeliveryService,
            PasswordEncoder passwordEncoder,
            ValkeyHealth valkeyHealth,
            OtpSendSchedule sendSchedule) {
        this.otpRepository = otpRepository;
        this.valkeyOtpStore = valkeyOtpStore;
        this.otpDeliveryService = otpDeliveryService;
        this.passwordEncoder = passwordEncoder;
        this.valkeyHealth = valkeyHealth;
        this.sendSchedule = sendSchedule;
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
        // Sign-in, setup, reset and email codes were claimed by AuthService before it
        // looked the account up, so a number with no account is counted too. Codes an
        // owner asks for (cash, agreements) are claimed here, on their own schedule.
        if (!OtpSendSchedule.AUTH_SCOPE.equals(OtpSendSchedule.scopeOf(purpose))) {
            claimSend(OtpSendSchedule.phoneKey(phone), purpose);
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

    /**
     * Takes a send on the resend schedule for this number or address, or refuses
     * with the seconds left (user, 2026-11-14). Called before any account lookup.
     */
    @Transactional
    public void claimSend(String identifier, OtpPurpose purpose) {
        sendSchedule.claim(identifier, OtpSendSchedule.scopeOf(purpose), Instant.now());
    }

    /** Seconds before the next code to this number or address may be sent; 0 when now. */
    @Transactional(readOnly = true)
    public long sendWaitSeconds(String identifier, OtpPurpose purpose) {
        return sendSchedule.waitSeconds(identifier, OtpSendSchedule.scopeOf(purpose), Instant.now());
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
     * The rules, asked of Valkey: the cooldown, the day's resend schedule, and the device.
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
