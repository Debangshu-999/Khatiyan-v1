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
     * the full fifteen minutes would be wrong by however long they had been
     * going.
     *
     * @return remaining seconds, or 0 when the key is gone or has no expiry
     */
    public long requestWindowRemainingSeconds(String phone) {
        Long ttl = valkeyTemplate.getExpire(rateKey(phone));
        return ttl == null || ttl < 0 ? 0L : ttl;
    }

    private String otpKey(String phone, OtpPurpose purpose) {
        return OTP_KEY_PREFIX + purpose.name() + ":" + phone;
    }

    private String rateKey(String phone) {
        return RATE_KEY_PREFIX + phone;
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
