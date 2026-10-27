package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.khatiyan.a_auth.model.LoginFailureReason;
import com.khatiyan.a_auth.repository.LoginAttemptRepository;
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
 * <p><b>Worked out from {@code auth.login_attempts} (2026-10-18).</b> It was a
 * Valkey counter, so PIN login failed whenever Valkey was down, and a count kept
 * elsewhere during an outage would have come back short. Every attempt is
 * already written to the ledger in its own transaction, and every PIN login
 * already reads it for the durable window, so the ledger is the tally: the
 * failures since the phone's last successful login, in a run with no gap of
 * {@link #FAILURE_TALLY_TTL} or more, which is when the Valkey tally expired.
 */
@Service
public class PhoneLoginLockService {

    /**
     * A gap this long between two failures starts the tally again.
     *
     * <p>Must outlast the LONGEST lock the ladder can hand out, or the tally
     * expires while the phone is still locked and the next attempt starts again
     * from one — the top of the ladder would then be unreachable.
     */
    static final Duration FAILURE_TALLY_TTL = Duration.ofDays(2);

    /** The failures the tally counts: a wrong PIN, and a number with no account, alike. */
    static final Set<LoginFailureReason> COUNTED = Set.of(LoginFailureReason.INVALID_PIN, LoginFailureReason.USER_NOT_FOUND);

    /** Far past the top of the ladder, and a bound on what one check reads. */
    private static final int MOST_FAILURES_READ = 1_000;

    private final LoginAttemptRepository loginAttemptRepository;
    private final LoginRateLimitProperties properties;

    public PhoneLoginLockService(LoginAttemptRepository loginAttemptRepository, LoginRateLimitProperties properties) {
        this.loginAttemptRepository = loginAttemptRepository;
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
        ensureNotLocked(normalizedPhone, Instant.now());
    }

    void ensureNotLocked(String normalizedPhone, Instant now) {
        List<Instant> failures = loginAttemptRepository.findFailureTimesSinceLastSuccess(
                normalizedPhone, COUNTED, PageRequest.of(0, MOST_FAILURES_READ));
        Instant until = lockedUntil(failures, properties);
        if (until != null && until.isAfter(now)) {
            throw new ValidationException("Too many login attempts for this phone. Try again later.");
        }
    }

    /**
     * When the lock from these failures ends, or null when they set none.
     *
     * <p>Walks the newest run of failures oldest first, numbering them as the
     * Valkey counter did, and keeps the lock the latest rung handed out.
     *
     * @param newestFirst failure times since the last success, newest first
     */
    static Instant lockedUntil(List<Instant> newestFirst, LoginRateLimitProperties properties) {
        if (newestFirst.isEmpty()) {
            return null;
        }
        int run = 1;
        while (run < newestFirst.size()
                && Duration.between(newestFirst.get(run), newestFirst.get(run - 1)).compareTo(FAILURE_TALLY_TTL) < 0) {
            run++;
        }
        Instant until = null;
        for (int index = run - 1; index >= 0; index--) {
            int attempt = run - index;
            Duration lockFor = properties.lockDurationForFailedAttempt(attempt);
            if (!lockFor.isZero() && !lockFor.isNegative()) {
                until = newestFirst.get(index).plus(lockFor);
            }
        }
        return until;
    }
}
