package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.khatiyan.a_auth.model.AuthUser;
import com.khatiyan.a_auth.model.SessionState;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.a_auth.repository.UserSessionRepository;
import com.khatiyan.c_shared.valkey.CacheFieldCipher;
import com.khatiyan.c_shared.valkey.SingleFlight;
import com.khatiyan.c_shared.valkey.ValkeyHealth;
import com.khatiyan.c_shared.valkey.ValkeyOutageListener;

/**
 * The user and session behind every signed-in request, cached so the request
 * reads neither row (2026-10-18).
 *
 * <p>The database is the truth. Valkey holds a copy while it is up. While it is
 * down, this backend's memory holds one instead, for 30 seconds an entry. Each
 * record is read from the database once and served from the cache after.
 *
 * <p><b>Nothing from before an outage is trusted after it.</b> Keys carry a
 * generation, {@code khatiyan:auth:g{N}:…}, and recovering from an outage
 * raises it before Valkey is used again. Every old key is unreachable at once,
 * so a device signed out while Valkey was down cannot come back. A backend
 * start counts as a recovery, so entries from an earlier run are never trusted
 * either.
 *
 * <p><b>Fills never overwrite, changes always do.</b> A fill from the database
 * writes only when the key is absent. A sign-out or a user change overwrites,
 * after its transaction commits. A request that read the database just before
 * a sign-out can then never write its stale answer over the sign-out.
 *
 * <p>Last seen is cosmetic and lives only here: written on every request, kept
 * outside the generation so a recovery does not lose it.
 */
@Component
public class AuthStateCache implements ValkeyOutageListener {

    static final String GENERATION_KEY = "khatiyan:auth:generation";
    static final String LAST_SEEN_PREFIX = "khatiyan:auth:last-seen:";
    static final Duration USER_TTL = Duration.ofHours(1);
    /** A revocation must outlive its token, so a little past the token's expiry. */
    static final Duration SESSION_SLACK = Duration.ofMinutes(2);
    /** For a token with no session row. Short, as nothing about it is worth keeping. */
    static final Duration UNKNOWN_SESSION_TTL = Duration.ofMinutes(5);
    /** Bounds how stale another backend copy's memory can be after a sign-out. */
    static final Duration MEMORY_TTL = Duration.ofSeconds(30);
    private static final long MEMORY_ENTRIES = 50_000;

    private final StringRedisTemplate valkey;
    private final ValkeyHealth health;
    private final UserRepository userRepository;
    private final UserSessionRepository sessionRepository;
    private final SingleFlight fills = new SingleFlight();
    /** Seals the phone number, so reading Valkey shows none (user, 2026-10-27). */
    private final CacheFieldCipher cipher;
    private volatile long generation = -1;

    private final Cache<UUID, Optional<AuthUser>> memoryUsers = Caffeine.newBuilder()
            .maximumSize(MEMORY_ENTRIES).expireAfterWrite(MEMORY_TTL).build();
    private final Cache<UUID, SessionState> memorySessions = Caffeine.newBuilder()
            .maximumSize(MEMORY_ENTRIES).expireAfterWrite(MEMORY_TTL).build();
    private final Cache<UUID, Instant> memoryLastSeen = Caffeine.newBuilder()
            .maximumSize(MEMORY_ENTRIES).expireAfterWrite(Duration.ofHours(2)).build();

    public AuthStateCache(
            StringRedisTemplate valkey,
            ValkeyHealth health,
            UserRepository userRepository,
            UserSessionRepository sessionRepository,
            CacheFieldCipher cipher) {
        this.cipher = cipher;
        this.valkey = valkey;
        this.health = health;
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
    }

    /** The user, absent when inactive or missing, and the session, for one request. */
    public record Snapshot(Optional<AuthUser> user, SessionState session) {
    }

    public Snapshot lookup(UUID userId, UUID sessionId) {
        if (health.available()) {
            List<String> found = readValkey(userId, sessionId);
            if (found != null) {
                Optional<AuthUser> user = decodeUser(found.get(0), cipher).orElseGet(() -> fillUser(userId));
                SessionState session = sessionId == null
                        ? SessionState.UNKNOWN
                        : decodeSession(found.get(1)).orElseGet(() -> fillSession(sessionId));
                return new Snapshot(user, session);
            }
        }
        Optional<AuthUser> user = memoryUsers.get(userId, this::loadUser);
        SessionState session = sessionId == null
                ? SessionState.UNKNOWN
                : memorySessions.get(sessionId, this::loadSession);
        return new Snapshot(user, session);
    }

    /** A session was signed out. Overwrites its entry once the sign-out commits. */
    public void sessionRevoked(UUID sessionId, Instant expiresAt) {
        SessionState revoked = SessionState.revoked(expiresAt);
        afterCommit(() -> {
            memorySessions.put(sessionId, revoked);
            writeValkey(sessionKey(sessionId), encodeSession(revoked), sessionTtl(revoked), true);
        });
    }

    /** A user row changed. Overwrites its entry once the change commits. */
    public void userChanged(User user) {
        Optional<AuthUser> now = user.isCurrentlyActive() ? Optional.of(AuthUser.of(user)) : Optional.empty();
        UUID userId = user.getId();
        afterCommit(() -> {
            memoryUsers.put(userId, now);
            writeValkey(userKey(userId), encodeUser(now, cipher), USER_TTL, true);
        });
    }

    /** This session made a request now. */
    public void seen(UUID sessionId, Instant now, Instant expiresAt) {
        if (sessionId == null) {
            return;
        }
        if (health.available()) {
            Duration ttl = expiresAt == null ? USER_TTL : untilPast(expiresAt);
            if (writeValkey(LAST_SEEN_PREFIX + sessionId, Long.toString(now.toEpochMilli()), ttl, true)) {
                return;
            }
        }
        memoryLastSeen.put(sessionId, now);
    }

    /** When each of these sessions last made a request, where that is known. */
    public Map<UUID, Instant> lastSeen(Collection<UUID> sessionIds) {
        Map<UUID, Instant> seen = new HashMap<>();
        if (sessionIds.isEmpty()) {
            return seen;
        }
        List<UUID> ids = new ArrayList<>(sessionIds);
        if (health.available()) {
            try {
                List<String> values = valkey.opsForValue().multiGet(ids.stream().map(id -> LAST_SEEN_PREFIX + id).toList());
                if (values != null && values.size() == ids.size()) {
                    for (int i = 0; i < ids.size(); i++) {
                        UUID id = ids.get(i);
                        parseMillis(values.get(i)).ifPresent(seenAt -> seen.put(id, seenAt));
                    }
                    return seen;
                }
            } catch (RuntimeException valkeyFailure) {
                health.failed(valkeyFailure);
            }
        }
        for (UUID id : ids) {
            Instant seenAt = memoryLastSeen.getIfPresent(id);
            if (seenAt != null) {
                seen.put(id, seenAt);
            }
        }
        return seen;
    }

    @Override
    public void onValkeyRecovering() {
        Long raised = valkey.opsForValue().increment(GENERATION_KEY);
        if (raised == null) {
            throw new IllegalStateException("Valkey did not raise the auth generation");
        }
        generation = raised;
        clearMemory();
    }

    @Override
    public void onValkeyDown() {
        clearMemory();
    }

    private void clearMemory() {
        memoryUsers.invalidateAll();
        memorySessions.invalidateAll();
        memoryLastSeen.invalidateAll();
    }

    // ---------------------------------------------------------------- fills

    private Optional<AuthUser> fillUser(UUID userId) {
        Optional<AuthUser> user = fills.run("user:" + userId, () -> loadUser(userId));
        writeValkey(userKey(userId), encodeUser(user, cipher), USER_TTL, false);
        return user;
    }

    private SessionState fillSession(UUID sessionId) {
        SessionState session = fills.run("session:" + sessionId, () -> loadSession(sessionId));
        writeValkey(sessionKey(sessionId), encodeSession(session), sessionTtl(session), false);
        return session;
    }

    private Optional<AuthUser> loadUser(UUID userId) {
        return userRepository.findById(userId).filter(User::isCurrentlyActive).map(AuthUser::of);
    }

    private SessionState loadSession(UUID sessionId) {
        return sessionRepository.findByJti(sessionId).map(SessionState::of).orElse(SessionState.UNKNOWN);
    }

    // --------------------------------------------------------------- Valkey

    /** Both keys in one round trip, or null when Valkey failed. */
    private List<String> readValkey(UUID userId, UUID sessionId) {
        try {
            List<String> keys = sessionId == null
                    ? List.of(userKey(userId))
                    : List.of(userKey(userId), sessionKey(sessionId));
            List<String> values = valkey.opsForValue().multiGet(keys);
            if (values == null || values.size() != keys.size()) {
                throw new IllegalStateException("Valkey answered " + keys.size() + " keys with " + values);
            }
            return sessionId == null ? java.util.Arrays.asList(values.get(0), null) : values;
        } catch (RuntimeException valkeyFailure) {
            health.failed(valkeyFailure);
            return null;
        }
    }

    /**
     * Writes one key. A fill writes only when absent, a change always.
     *
     * <p>A failed change marks Valkey down, so the generation is raised before
     * Valkey is used again and its stale copy is never read.
     */
    private boolean writeValkey(String key, String value, Duration ttl, boolean overwrite) {
        if (!health.available()) {
            return false;
        }
        try {
            if (overwrite) {
                valkey.opsForValue().set(key, value, ttl);
            } else {
                valkey.opsForValue().setIfAbsent(key, value, ttl);
            }
            return true;
        } catch (RuntimeException valkeyFailure) {
            health.failed(valkeyFailure);
            return false;
        }
    }

    private String userKey(UUID userId) {
        return "khatiyan:auth:g" + generation + ":user:" + userId;
    }

    private String sessionKey(UUID sessionId) {
        return "khatiyan:auth:g" + generation + ":session:" + sessionId;
    }

    private static Duration sessionTtl(SessionState session) {
        return session.expiresAt() == null ? UNKNOWN_SESSION_TTL : untilPast(session.expiresAt());
    }

    private static Duration untilPast(Instant expiresAt) {
        Duration left = Duration.between(Instant.now(), expiresAt).plus(SESSION_SLACK);
        return left.compareTo(Duration.ofSeconds(1)) < 0 ? Duration.ofSeconds(1) : left;
    }

    // ------------------------------------------------------------- encoding

    /**
     * {@code 1|credentialVersion|role|id|enc:…}, or {@code 0} for an inactive or missing user. The
     * phone is sealed (user, 2026-10-27): kept, but unreadable to anyone reading Valkey.
     */
    static String encodeUser(Optional<AuthUser> user, CacheFieldCipher cipher) {
        return user.map(found -> "1|" + found.credentialVersion() + "|" + found.role().name() + "|" + found.id()
                        + "|" + cipher.seal(found.phone()))
                .orElse("0");
    }

    /** Empty when there is no usable entry, which is a miss. */
    static Optional<Optional<AuthUser>> decodeUser(String value, CacheFieldCipher cipher) {
        if (value == null) {
            return Optional.empty();
        }
        if (value.equals("0")) {
            return Optional.of(Optional.empty());
        }
        String[] parts = value.split("\\|", 5);
        if (parts.length != 5 || !parts[0].equals("1")) {
            return Optional.empty();
        }
        // A phone that does not open (another key, or tampered with) makes the whole entry a miss.
        Optional<String> phone = cipher.open(parts[4]);
        if (phone.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(Optional.of(new AuthUser(
                    UUID.fromString(parts[3]), phone.get(), UserRole.valueOf(parts[2]), Integer.parseInt(parts[1]))));
        } catch (IllegalArgumentException corrupt) {
            return Optional.empty();
        }
    }

    /** {@code L|expiresAtMillis} live, {@code R|expiresAtMillis} revoked, {@code N} no row. */
    static String encodeSession(SessionState session) {
        if (!session.known()) {
            return "N";
        }
        return (session.revoked() ? "R|" : "L|") + session.expiresAt().toEpochMilli();
    }

    static Optional<SessionState> decodeSession(String value) {
        if (value == null) {
            return Optional.empty();
        }
        if (value.equals("N")) {
            return Optional.of(SessionState.UNKNOWN);
        }
        String[] parts = value.split("\\|", 2);
        if (parts.length != 2 || !(parts[0].equals("L") || parts[0].equals("R"))) {
            return Optional.empty();
        }
        return parseMillis(parts[1]).map(expiresAt -> new SessionState(true, parts[0].equals("R"), expiresAt));
    }

    private static Optional<Instant> parseMillis(String value) {
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(Instant.ofEpochMilli(Long.parseLong(value)));
        } catch (NumberFormatException corrupt) {
            return Optional.empty();
        }
    }

    private static void afterCommit(Runnable change) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    change.run();
                }
            });
        } else {
            change.run();
        }
    }
}
