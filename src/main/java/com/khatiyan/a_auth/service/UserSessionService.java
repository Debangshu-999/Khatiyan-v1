package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.event.NewDeviceSignedInEvent;
import com.khatiyan.a_auth.model.UserSession;
import com.khatiyan.a_auth.repository.UserSessionRepository;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The signed-in device list, and the ability to end any one of them.
 *
 * <p>Split across two stores on purpose:
 *
 * <ul>
 *   <li><b>Postgres</b> holds the rows people read — which device, since when,
 *       last used. That is a list, queried rarely, and belongs in a database.
 *   <li><b>Valkey</b> holds the revocations the auth filter checks. That is
 *       consulted on EVERY authenticated request, and a Postgres lookup there
 *       would put a query in front of every call in the app.
 * </ul>
 *
 * <p>A revocation only has to be remembered until the token would have expired
 * anyway — an hour at present — so the Valkey key carries exactly that TTL and
 * then disappears. The row stays in Postgres as the durable record.
 */
@Service
public class UserSessionService {

    private static final String REVOKED_KEY_PREFIX = "khatiyan:auth:session-revoked:";

    /**
     * Skew allowance on the revocation key's TTL.
     *
     * <p>The key must outlive the token it kills. If it expired even a second
     * early the token would come back to life for that second, which is the one
     * outcome revocation may not have.
     */
    private static final Duration REVOCATION_TTL_SLACK = Duration.ofMinutes(2);

    /**
     * How stale {@code last_seen_at} is allowed to get.
     *
     * <p>Writing it on every request would make being signed in the most
     * write-heavy thing in the app — a row update, a WAL record and contention
     * on a hot row, per call, to power a line of text. At this granularity
     * "last active" is still true enough to be useful and costs almost nothing.
     */
    private static final Duration LAST_SEEN_WRITE_INTERVAL = Duration.ofMinutes(5);

    private final UserSessionRepository userSessionRepository;
    private final StringRedisTemplate valkeyTemplate;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActiveSessions;

    public UserSessionService(
            UserSessionRepository userSessionRepository,
            StringRedisTemplate valkeyTemplate,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.auth.max-active-sessions:4}") int maxActiveSessions) {
        this.userSessionRepository = userSessionRepository;
        this.valkeyTemplate = valkeyTemplate;
        this.eventPublisher = eventPublisher;
        this.maxActiveSessions = maxActiveSessions;
    }

    /**
     * Refuses a sign-in that would exceed the concurrent-session cap.
     *
     * <p>Called only AFTER credentials have been proven, which is what keeps it
     * from becoming an account-enumeration oracle: reaching this point requires
     * the correct PIN (or control of the mailbox), and whoever has that already
     * knows the account exists. Moved any earlier — to phone entry, or to the OTP
     * request — the refusal itself would answer "is this number registered?" for
     * anyone who asked.
     */
    @Transactional(readOnly = true)
    public void ensureCapacity(UUID userId, Instant now) {
        List<UserSession> live = userSessionRepository.findLiveByUser(userId, now);
        if (live.size() >= maxActiveSessions) {
            throw new SessionLimitReachedException(live);
        }
    }

    /**
     * Ends one session as part of signing in, with no caller session to protect.
     *
     * <p>Separate from {@link #revoke} because that one refuses to revoke the
     * requester's own — a rule that only makes sense once there IS a requester.
     * Here nobody is signed in yet; the account is proven by the credentials on
     * the same request.
     */
    @Transactional
    public void revokeForSignIn(UUID userId, UUID sessionRowId, Instant now) {
        UserSession session = userSessionRepository.findById(sessionRowId)
                .filter(candidate -> candidate.getUserId().equals(userId))
                .orElseThrow(() -> new NotFoundException("Session", sessionRowId.toString()));

        session.revoke(now);
        blockUntilExpiry(session, now);
    }

    @Transactional
    public void open(
            UUID userId,
            UUID sessionId,
            String deviceLabel,
            String platform,
            Instant now,
            Instant expiresAt) {
        // Decided BEFORE the row is saved, or the row we just wrote would be the
        // prior sighting that proves the device is not new.
        boolean unfamiliar = isUnfamiliarDevice(userId, deviceLabel);

        userSessionRepository.save(
                UserSession.opened(userId, sessionId, deviceLabel, platform, now, expiresAt));

        if (unfamiliar) {
            eventPublisher.publishEvent(new NewDeviceSignedInEvent(userId, deviceLabel));
        }
    }

    /**
     * Whether this sign-in deserves a security alert.
     *
     * <p>Three ways to be familiar, and all three must fail: an unnamed device
     * (nothing to recognise, so nothing to claim), the account's very first
     * device (no prior to compare against), and any device that has signed in
     * under this label before, however long ago.
     */
    private boolean isUnfamiliarDevice(UUID userId, String deviceLabel) {
        if (deviceLabel == null || deviceLabel.isBlank()) {
            return false;
        }
        if (!userSessionRepository.existsByUserId(userId)) {
            return false;
        }
        return !userSessionRepository.existsByUserIdAndDeviceLabel(userId, deviceLabel);
    }

    /**
     * Whether the token carrying this session id has been revoked.
     *
     * <p>Valkey only — never Postgres. This runs inside the auth filter, so its
     * cost is paid by every authenticated request in the app.
     *
     * <p>A null id means a token minted before sessions existed. Those are
     * honoured until they expire rather than rejected, so shipping this does not
     * sign everyone out.
     */
    public boolean isRevoked(UUID sessionId) {
        if (sessionId == null) {
            return false;
        }
        return Boolean.TRUE.equals(valkeyTemplate.hasKey(revokedKey(sessionId)));
    }

    /** The device list, current session flagged so the client need not work it out. */
    @Transactional(readOnly = true)
    public List<UserSession> listLive(UUID userId, Instant now) {
        return userSessionRepository.findLiveByUser(userId, now);
    }

    /**
     * Ends one session.
     *
     * <p>Refuses the caller's own: signing yourself out is a different action
     * with different consequences, and doing it from a list of other devices is
     * almost certainly a misfire.
     */
    @Transactional
    public void revoke(UUID userId, UUID sessionRowId, UUID callerSessionId, Instant now) {
        UserSession session = userSessionRepository.findById(sessionRowId)
                .filter(candidate -> candidate.getUserId().equals(userId))
                .orElseThrow(() -> new NotFoundException("Session", sessionRowId.toString()));

        if (session.getJti().equals(callerSessionId)) {
            throw new ValidationException("This is the device you are using. Sign out instead.");
        }

        session.revoke(now);
        blockUntilExpiry(session, now);
    }

    /**
     * Ends every session a user holds.
     *
     * <p>Pairs with a {@code credentialVersion} bump, which already kills the
     * tokens themselves. This is what stops the list from going on describing
     * devices that were signed out the moment the PIN changed.
     */
    @Transactional
    public void revokeAll(UUID userId, Instant now) {
        List<UserSession> live = userSessionRepository.findLiveByUser(userId, now);
        userSessionRepository.revokeAllForUser(userId, now);
        // The Valkey keys are belt to the credentialVersion braces. Either alone
        // would do it; together the token dies whichever check runs first.
        live.forEach(session -> blockUntilExpiry(session, now));
    }

    /**
     * Records that a session was used, at most once every few minutes.
     *
     * <p>Returns without touching the database when the stamp is fresh, which is
     * the overwhelmingly common case.
     */
    @Transactional
    public void touch(UUID sessionId, Instant now) {
        if (sessionId == null) {
            return;
        }
        userSessionRepository.findByJti(sessionId)
                .filter(session -> session.getLastSeenAt().plus(LAST_SEEN_WRITE_INTERVAL).isBefore(now))
                .ifPresent(session -> session.touch(now));
    }

    private void blockUntilExpiry(UserSession session, Instant now) {
        Duration remaining = Duration.between(now, session.getExpiresAt()).plus(REVOCATION_TTL_SLACK);
        if (remaining.isNegative() || remaining.isZero()) {
            // Already expired on its own; there is nothing left to block.
            return;
        }
        valkeyTemplate.opsForValue().set(revokedKey(session.getJti()), "1", remaining);
    }

    private String revokedKey(UUID sessionId) {
        return REVOKED_KEY_PREFIX + sessionId;
    }
}
