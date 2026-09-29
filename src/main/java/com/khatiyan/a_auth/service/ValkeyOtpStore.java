package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.khatiyan.a_auth.model.OtpPurpose;

/**
 * Valkey-backed store for active OTP state.
 *
 * <p>Spring's client APIs still use the Redis naming because Valkey speaks the
 * same protocol. The actual local server can be Valkey.
 */
@Service
public class ValkeyOtpStore {

    private static final String OTP_KEY_PREFIX = "khatiyan:auth:otp:";
    private static final String RATE_KEY_PREFIX = "khatiyan:auth:otp-rate:";
    private static final String IP_RATE_KEY_PREFIX = "khatiyan:auth:otp-rate-ip:";
    private static final String HOURLY_RATE_KEY_PREFIX = "khatiyan:auth:otp-rate-hour:";
    private static final String COOLDOWN_KEY_PREFIX = "khatiyan:auth:otp-cooldown:";

    private static final String FIELD_PHONE = "phone";
    private static final String FIELD_PURPOSE = "purpose";
    private static final String FIELD_OTP_HASH = "otpHash";
    private static final String FIELD_ATTEMPTS = "attempts";
    private static final String FIELD_CREATED_AT = "createdAt";
    private static final String FIELD_EXPIRES_AT = "expiresAt";

    private final StringRedisTemplate valkeyTemplate;
    private final HashOperations<String, String, String> hashOperations;

    public ValkeyOtpStore(StringRedisTemplate valkeyTemplate) {
        this.valkeyTemplate = valkeyTemplate;
        this.hashOperations = valkeyTemplate.opsForHash();
    }

    /**
     * Stores one active OTP for a phone and purpose with Valkey TTL.
     */
    public void saveOtp(String phone, OtpPurpose purpose, String otpHash, Instant now, Duration ttl) {
        Instant expiresAt = now.plus(ttl);
        String key = otpKey(phone, purpose);

        hashOperations.putAll(key, Map.of(
                FIELD_PHONE, phone,
                FIELD_PURPOSE, purpose.name(),
                FIELD_OTP_HASH, otpHash,
                FIELD_ATTEMPTS, "0",
                FIELD_CREATED_AT, now.toString(),
                FIELD_EXPIRES_AT, expiresAt.toString()));

        valkeyTemplate.expire(key, ttl);
    }

    /**
     * Loads the active Valkey OTP if its TTL has not expired.
     */
    public Optional<ValkeyOtp> findOtp(String phone, OtpPurpose purpose) {
        String key = otpKey(phone, purpose);
        Map<String, String> values = hashOperations.entries(key);

        if (values.isEmpty()) {
            return Optional.empty();
        }

        return Optional.of(new ValkeyOtp(
                values.get(FIELD_PHONE),
                OtpPurpose.valueOf(values.get(FIELD_PURPOSE)),
                values.get(FIELD_OTP_HASH),
                intValue(values.get(FIELD_ATTEMPTS)),
                Instant.parse(values.get(FIELD_CREATED_AT)),
                Instant.parse(values.get(FIELD_EXPIRES_AT))));
    }

    /**
     * Increments failed verification attempts for the active Valkey OTP.
     */
    public void recordFailedAttempt(String phone, OtpPurpose purpose) {
        hashOperations.increment(otpKey(phone, purpose), FIELD_ATTEMPTS, 1);
    }

    /**
     * Consumes the active Valkey OTP by deleting it.
     */
    public void consumeOtp(String phone, OtpPurpose purpose) {
        valkeyTemplate.delete(otpKey(phone, purpose));
    }

    /**
     * Counts OTP issue requests for a phone within a Valkey TTL window.
     */
    public long incrementRequestCount(String phone, Duration window) {
        String key = rateKey(phone);
        Long count = valkeyTemplate.opsForValue().increment(key);

        if (count != null && count == 1L) {
            valkeyTemplate.expire(key, window);
        }

        return count == null ? 0L : count;
    }

    /**
     * Seconds until this phone's request budget resets.
     *
     * <p>Read from the counter key's own TTL rather than assumed from the
     * window length: the window starts at the FIRST request, so somebody
     * refused on their third has already used part of it. Telling them to wait
     * the full window would be wrong by however long they had been
     * going.
     *
     * @return remaining seconds, or 0 when the key is gone or has no expiry
     */
    public long requestWindowRemainingSeconds(String phone) {
        Long ttl = valkeyTemplate.getExpire(rateKey(phone));
        return ttl == null || ttl < 0 ? 0L : ttl;
    }

    /**
     * The same count for a phone over the LONG window.
     *
     * <p>Its own key, because the two windows start and expire independently:
     * the ten-minute count can reset while the hour's is still running, which
     * is exactly what stops somebody waiting out the short one over and over.
     */
    public long incrementHourlyRequestCount(String phone, Duration window) {
        String key = HOURLY_RATE_KEY_PREFIX + phone;
        Long count = valkeyTemplate.opsForValue().increment(key);

        if (count != null && count == 1L) {
            valkeyTemplate.expire(key, window);
        }

        return count == null ? 0L : count;
    }

    /** Seconds until this phone's hourly budget resets. See {@link #requestWindowRemainingSeconds}. */
    public long hourlyRequestWindowRemainingSeconds(String phone) {
        Long ttl = valkeyTemplate.getExpire(HOURLY_RATE_KEY_PREFIX + phone);
        return ttl == null || ttl < 0 ? 0L : ttl;
    }

    /**
     * Counts OTP issue requests from one IP within a Valkey TTL window.
     *
     * <p>The limit that stops one device spraying codes at many numbers — SMS
     * pumping, where every message is billed to us. It used to exist only in
     * the database check, and so only while that check ran on every request.
     */
    public long incrementIpRequestCount(String ipAddress, Duration window) {
        String key = IP_RATE_KEY_PREFIX + ipAddress;
        Long count = valkeyTemplate.opsForValue().increment(key);

        if (count != null && count == 1L) {
            valkeyTemplate.expire(key, window);
        }

        return count == null ? 0L : count;
    }

    /** Seconds until this IP's request budget resets. See {@link #requestWindowRemainingSeconds}. */
    public long ipRequestWindowRemainingSeconds(String ipAddress) {
        Long ttl = valkeyTemplate.getExpire(IP_RATE_KEY_PREFIX + ipAddress);
        return ttl == null || ttl < 0 ? 0L : ttl;
    }

    /**
     * Starts the pause between one code and the next, if none is running.
     *
     * <p>Set-if-absent, so two taps landing together cannot both get through:
     * exactly one of them starts the cooldown and the other is refused.
     *
     * <p>Per number AND purpose. A tenant who has just been sent a login code
     * can still be sent a cash-payment code — they are different messages for
     * different reasons — but not a second cash code a moment after the first.
     *
     * @return false when a cooldown is already running
     */
    public boolean startResendCooldown(String phone, OtpPurpose purpose, Duration cooldown) {
        Boolean started = valkeyTemplate.opsForValue().setIfAbsent(cooldownKey(phone, purpose), "1", cooldown);
        return Boolean.TRUE.equals(started);
    }

    /** Seconds left on the running cooldown, or 0 when there is none. */
    public long resendCooldownRemainingSeconds(String phone, OtpPurpose purpose) {
        Long ttl = valkeyTemplate.getExpire(cooldownKey(phone, purpose));
        return ttl == null || ttl < 0 ? 0L : ttl;
    }

    private String otpKey(String phone, OtpPurpose purpose) {
        return OTP_KEY_PREFIX + purpose.name() + ":" + phone;
    }

    private String rateKey(String phone) {
        return RATE_KEY_PREFIX + phone;
    }

    private String cooldownKey(String phone, OtpPurpose purpose) {
        return COOLDOWN_KEY_PREFIX + purpose.name() + ":" + phone;
    }

    private int intValue(String value) {
        return Integer.parseInt(value);
    }

    public record ValkeyOtp(
            String phone,
            OtpPurpose purpose,
            String otpHash,
            int attempts,
            Instant createdAt,
            Instant expiresAt
    ) {
    }
}
