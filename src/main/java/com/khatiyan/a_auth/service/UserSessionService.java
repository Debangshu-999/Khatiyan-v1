package com.khatiyan.a_auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(UserSessionService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    /**
     * How long a used refresh token is still honoured. The app may never have received
     * the reply to using it, on a bad connection: that must not sign anyone out.
     */
    static final Duration REFRESH_GRACE = Duration.ofSeconds(30);

    /** A renewal: the session it belongs to, and the new refresh token to hand back. */
    public record RotatedRefresh(UUID userId, UUID sessionId, String refreshToken) {
    }

    private final UserSessionRepository userSessionRepository;
    private final AuthStateCache authStateCache;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActiveSessions;
    private final Duration sessionLifetime;

    public UserSessionService(
            UserSessionRepository userSessionRepository,
            AuthStateCache authStateCache,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.auth.max-active-sessions:4}") int maxActiveSessions,
            @Value("${app.jwt.refresh-token-expiry-days:30}") long refreshTokenExpiryDays) {
        this.userSessionRepository = userSessionRepository;
        this.authStateCache = authStateCache;
        this.eventPublisher = eventPublisher;
        this.maxActiveSessions = maxActiveSessions;
        this.sessionLifetime = Duration.ofDays(refreshTokenExpiryDays);
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
     * Ends the live sessions an earlier install on this same device left behind (user,
     * 2026-11-07).
     *
     * <p>An uninstalled app, or a browser whose storage was cleared, cannot sign itself
     * out, so its session stayed live for 30 days and held one of the four places. The
     * server is never told of an uninstall. What it does see is the same device signing in
     * again: the same name on the same platform. That new sign-in replaces the old ones,
     * before the cap is counted. Called only once credentials are proven.
     *
     * <p>A blank name matches nothing, as it says nothing about which device it was.
     */
    @Transactional
    public void replaceSameDevice(UUID userId, String deviceLabel, String platform, Instant now) {
        if (deviceLabel == null || deviceLabel.isBlank()) {
            return;
        }
        for (UserSession session : userSessionRepository.findLiveByUser(userId, now)) {
            if (deviceLabel.equals(session.getDeviceLabel()) && java.util.Objects.equals(platform, session.getPlatform())) {
                session.revoke(now);
                authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt());
                log.info("Session replaced by the same device signing in again userId={} jti={}", userId, session.getJti());
            }
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

    /** @return the new session's refresh token, which is not kept anywhere in the clear */
    @Transactional
    public String open(
            UUID userId,
            UUID sessionId,
            String deviceLabel,
            String platform,
            Instant now) {
        // Decided BEFORE the row is saved, or the row we just wrote would be the
        // prior sighting that proves the device is not new.
        boolean unfamiliar = isUnfamiliarDevice(userId, deviceLabel);
        // Every sign-in path comes through here, the Firebase one included.
        replaceSameDevice(userId, deviceLabel, platform, now);

        String refreshToken = newRefreshToken();
        userSessionRepository.save(UserSession.opened(
                userId, sessionId, deviceLabel, platform, now, now.plus(sessionLifetime), hash(refreshToken)));

        if (unfamiliar) {
            eventPublisher.publishEvent(new NewDeviceSignedInEvent(userId, deviceLabel));
        }
        return refreshToken;
    }

    /**
     * Swaps a refresh token for a new one, and moves the session's end on, so someone who
     * keeps using the app stays signed in and someone who stops is signed out.
     *
     * <p>A token works once. The one just used is honoured for {@link #REFRESH_GRACE} after,
     * for a reply lost on the way back. Used again after that, it was copied: whoever holds
     * it may not be the owner, and there is no telling which of the two is asking, so the
     * session ends. Returns empty rather than throwing, or that revocation would roll back.
     */
    @Transactional
    public Optional<RotatedRefresh> rotate(String presented, Instant now) {
        String presentedHash = hash(presented);
        Optional<UserSession> current = userSessionRepository.findByRefreshTokenHash(presentedHash);
        String next = newRefreshToken();
        if (current.isPresent()) {
            UserSession session = current.get();
            if (!session.isLive(now)) {
                log.info("Refresh refused, the session has ended sessionId={} userId={}", session.getJti(), session.getUserId());
                return Optional.empty();
            }
            session.rotateRefreshToken(hash(next), now, now.plus(sessionLifetime));
            return Optional.of(new RotatedRefresh(session.getUserId(), session.getJti(), next));
        }
        Optional<UserSession> previous = userSessionRepository.findByPreviousRefreshTokenHash(presentedHash);
        if (previous.isEmpty() || !previous.get().isLive(now)) {
            // Logged so a sign-out can be explained afterwards (2026-11-07). Never the token itself.
            log.info("Refresh refused, {}", previous.isEmpty() ? "the token is not known" : "the session has ended sessionId=" + previous.get().getJti());
            return Optional.empty();
        }
        UserSession session = previous.get();
        if (session.withinRefreshGrace(now, REFRESH_GRACE)) {
            session.replaceRefreshTokenInGrace(hash(next), now.plus(sessionLifetime));
            return Optional.of(new RotatedRefresh(session.getUserId(), session.getJti(), next));
        }
        log.warn("A used refresh token came back, ending the session sessionId={} userId={}", session.getJti(), session.getUserId());
        session.revoke(now);
        authStateCache.sessionRevoked(session.getJti(), session.getExpiresAt());
        return Optional.empty();
    }

    private static String newRefreshToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String refreshToken) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(refreshToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is not available", impossible);
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
