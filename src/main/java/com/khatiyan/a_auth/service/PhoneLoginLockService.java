package com.khatiyan.a_auth.service;

import java.time.Duration;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The progressive login lock, applied to a PHONE NUMBER rather than to a user.
 *
 * <p>This exists to close an account-enumeration oracle. The escalating lock on
 * {@code User} can only fire for a number that HAS an account, while the phone
 * and IP limiters around it fire at 20 attempts for anybody. That gap was
 * readable: six wrong PINs at a registered number changed the refusal wording on
 * the sixth attempt, while an unregistered number kept saying "Invalid phone or
 * PIN" until the twentieth. The message was identical either way — the tell was
 * WHICH ATTEMPT it arrived on, so matching the wording never fixed it.
 *
 * <p>Keyed on the phone STRING, so no user row is needed and a number that was
 * never registered is counted exactly like one that was. It runs the same
 * {@link LoginRateLimitProperties#lockDurationForFailedAttempt(int)} the user
 * row runs, so the two escalate in step — 5, 15, 30, 60, then 1440 minutes — and
 * stay indistinguishable at every attempt count rather than only at the sixth.
 *
 * <p>Valkey, not Postgres: this is checked before every login, and it is a
 * counter with a TTL, which is the one thing a key-value store is unambiguously
 * better at. The durable {@code login_attempts} ledger still records the audit
 * trail.
 */
@Service
public class PhoneLoginLockService {

    private static final String FAILURE_KEY_PREFIX = "khatiyan:auth:login-fails:";
    private static final String LOCK_KEY_PREFIX = "khatiyan:auth:login-lock:";

    /**
     * How long a phone's failure tally survives.
     *
     * <p>Must outlast the LONGEST lock the ladder can hand out, or the tally
     * expires while the phone is still locked and the next attempt starts again
     * from one — the top of the ladder would then be unreachable and the lock
     * would silently cap at five minutes forever.
     */
    private static final Duration FAILURE_TALLY_TTL = Duration.ofDays(2);

    private final StringRedisTemplate valkeyTemplate;
    private final LoginRateLimitProperties properties;

    public PhoneLoginLockService(StringRedisTemplate valkeyTemplate, LoginRateLimitProperties properties) {
        this.valkeyTemplate = valkeyTemplate;
        this.properties = properties;
    }

    /**
     * Refuses a locked phone before anything else looks at it.
     *
     * <p>Called BEFORE the user lookup on purpose. Running after it would mean a
     * registered number is refused by this and an unregistered one by something
     * further down, which is the difference the oracle read in the first place.
     *
     * <p>The wording is deliberately the same sentence the phone and IP limiters
     * use. A message only a real account could produce is itself an oracle.
     */
    public void ensureNotLocked(String normalizedPhone) {
        if (Boolean.TRUE.equals(valkeyTemplate.hasKey(lockKey(normalizedPhone)))) {
            throw new ValidationException("Too many login attempts for this phone. Try again later.");
        }
    }

    /**
     * Counts one failed attempt against the phone and locks it once the tally
     * reaches a rung on the ladder.
     *
     * <p>Call for a wrong PIN and for a number with no account alike — treating
     * those two differently is the whole bug.
     */
    public void recordFailure(String normalizedPhone) {
        Long tally = valkeyTemplate.opsForValue().increment(failureKey(normalizedPhone));
        if (tally == null) {
            return;
        }

        // Refreshed on every failure rather than set once, so a phone under a
        // slow drip of attempts does not age out of its own tally.
        valkeyTemplate.expire(failureKey(normalizedPhone), FAILURE_TALLY_TTL);

        Duration lockFor = properties.lockDurationForFailedAttempt(tally.intValue());
        if (lockFor.isZero() || lockFor.isNegative()) {
            return;
        }

        valkeyTemplate.opsForValue().set(lockKey(normalizedPhone), tally.toString(), lockFor);
    }

    /**
     * Forgets a phone's failures. Mirrors {@code User.clearLoginLock()}, which a
     * successful sign-in already performs on the user row — without this the two
     * would drift apart the moment anybody logged in successfully.
     */
    public void clear(String normalizedPhone) {
        valkeyTemplate.delete(failureKey(normalizedPhone));
        valkeyTemplate.delete(lockKey(normalizedPhone));
    }

    private String failureKey(String normalizedPhone) {
        return FAILURE_KEY_PREFIX + normalizedPhone;
    }

    private String lockKey(String normalizedPhone) {
        return LOCK_KEY_PREFIX + normalizedPhone;
    }
}
