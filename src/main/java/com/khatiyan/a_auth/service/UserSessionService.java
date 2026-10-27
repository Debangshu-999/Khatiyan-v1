package com.khatiyan.a_auth.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
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
 * <p>The rows are the truth: which device, since when, and whether it was
 * signed out. The auth filter reads them through {@link AuthStateCache}, so a
 * signed-in request does not query them (2026-10-18). Every sign-out here
 * overwrites the cached copy once it commits. Last seen lives only in that
 * cache, written on every request, and is shown from there.
 */
@Service
public class UserSessionService {

    private final UserSessionRepository userSessionRepository;
    private final AuthStateCache authStateCache;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActiveSessions;

    public UserSessionService(
            UserSessionRepository userSessionRepository,
            AuthStateCache authStateCache,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.auth.max-active-sessions:4}") int maxActiveSessions) {
        this.userSessionRepository = userSessionRepository;
        this.authStateCache = authStateCache;
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
        authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt());
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
        authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt());
    }

    /**
     * Signs the caller out: ends the session their own token belongs to.
     *
     * <p>Sign-out used to be client-only — the app forgot its token and the
     * server went on counting the session as live until the token expired. Four
     * sign-in/sign-out cycles inside that hour filled the device cap on one
     * phone, and the fifth sign-in was refused as if four devices were in use.
     *
     * <p>Quiet when there is nothing to end: a token minted before sessions
     * existed, or a session already revoked. Signing out must always succeed.
     */
    @Transactional
    public void revokeOwn(UUID userId, UUID sessionId, Instant now) {
        if (sessionId == null) {
            return;
        }
        userSessionRepository.findByJti(sessionId)
                .filter(session -> session.getUserId().equals(userId))
                .ifPresent(session -> {
                    session.revoke(now);
                    authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt());
                });
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
        // The cached sessions are belt to the credentialVersion braces. Either
        // alone would do it; together the token dies whichever check runs first.
        live.forEach(session -> authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt()));
    }

    /** When each of these sessions last made a request, from the cache, where known. */
    public Map<java.util.UUID, Instant> lastSeen(List<UserSession> sessions) {
        return authStateCache.lastSeen(sessions.stream().map(UserSession::getJti).toList());
    }
}
