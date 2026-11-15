package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.c_shared.exception.TooManyRequestsException;

/**
 * When the next code may be sent (user, 2026-11-14), read from the database.
 *
 * <p>The schedule: 30 seconds between the first 3 codes in a day, then the gap
 * doubles for every further 3 (a minute before codes 4-6, two before 7-9, four
 * before 10-12, eight before 13-15), never more than a day. Tightened the same
 * day from "first 20, then every 10" so one number stays inside 20 codes an hour
 * (about 16 at most, about 28 a day) — the per-device limit is 20 an hour too.
 *
 * <p>What closes the ways around it:
 * <ul>
 *   <li>Every request is counted, for any number or address, account or not. A
 *       number with no account is refused and timed exactly like a real one, so
 *       neither the refusals nor the wait endpoint tell the two apart.</li>
 *   <li>Signing in, setting up a PIN, resetting it and signing in by email share
 *       one schedule per number or address, so switching between them cannot
 *       double the codes. Codes an owner asks for (cash, agreements) keep their
 *       own, so they never block a tenant's sign-in.</li>
 *   <li>Numbers arrive normalised and addresses lower-cased, so +91, spaces or
 *       capitals are the same identifier.</li>
 *   <li>Two requests at the same moment are serialised by a transaction lock on
 *       the identifier, so both cannot read "free" and both send.</li>
 *   <li>Only the server's clock is used. A refused request is not recorded, and
 *       a request that fails later rolls its record back with it.</li>
 * </ul>
 */
@Component
public class OtpSendSchedule {

    /** The schedule counts the codes sent over this window. */
    static final Duration COUNT_WINDOW = Duration.ofDays(1);
    static final Duration SHORT_GAP = Duration.ofSeconds(30);
    private static final int CODES_AT_THE_SHORT_GAP = 3;
    private static final int CODES_PER_STEP = 3;
    private static final Duration FIRST_LONGER_GAP = Duration.ofMinutes(1);
    private static final Duration LONGEST_GAP = Duration.ofDays(1);
    /** The shared scope of the sign-in, setup, reset and email codes. */
    static final String AUTH_SCOPE = "AUTH";
    static final String TOO_SOON = "Please wait before requesting another code";

    private final OtpSendLog log;

    public OtpSendSchedule(OtpSendLog log) {
        this.log = log;
    }

    /** The wait before the next code, once {@code sent} codes have gone out in the window. */
    public static Duration gapAfter(long sent) {
        if (sent < CODES_AT_THE_SHORT_GAP) {
            return SHORT_GAP;
        }
        long step = (sent - CODES_AT_THE_SHORT_GAP) / CODES_PER_STEP;
        if (step >= 20) {
            return LONGEST_GAP;
        }
        Duration gap = FIRST_LONGER_GAP.multipliedBy(1L << step);
        return gap.compareTo(LONGEST_GAP) > 0 ? LONGEST_GAP : gap;
    }

    public static String phoneKey(String normalizedPhone) {
        return "phone:" + normalizedPhone;
    }

    public static String emailKey(String email) {
        return "email:" + (email == null ? "" : email.trim().toLowerCase(Locale.ROOT));
    }

    public static String scopeOf(OtpPurpose purpose) {
        return switch (purpose) {
            case LOGIN, PIN_RESET, EMAIL_LOGIN -> AUTH_SCOPE;
            default -> purpose.name();
        };
    }

    /** Seconds before the next code may be sent; 0 when it may be sent now. */
    public long waitSeconds(String identifier, String scope, Instant now) {
        OtpSendLog.Window window = log.window(identifier, scope, now.minus(COUNT_WINDOW));
        if (window.count() == 0 || window.latest() == null) {
            return 0L;
        }
        Instant nextAllowed = window.latest().plus(gapAfter(window.count()));
        long millis = Duration.between(now, nextAllowed).toMillis();
        return millis <= 0 ? 0L : (millis + 999) / 1000;
    }

    /**
     * Takes a send for this identifier now, or refuses with the seconds left.
     * Runs inside the caller's transaction: the lock and the record are both
     * released or rolled back with it.
     */
    public void claim(String identifier, String scope, Instant now) {
        log.lock(identifier, scope);
        long wait = waitSeconds(identifier, scope, now);
        if (wait > 0) {
            throw new TooManyRequestsException(TOO_SOON, wait);
        }
        log.record(identifier, scope, now);
    }

    /** Records older than the window are never read again: a day's grace, then gone. */
    @Scheduled(cron = "0 17 3 * * *", zone = "Asia/Kolkata")
    public void purgeOldRecords() {
        log.purgeBefore(Instant.now().minus(COUNT_WINDOW.multipliedBy(2)));
    }
}
