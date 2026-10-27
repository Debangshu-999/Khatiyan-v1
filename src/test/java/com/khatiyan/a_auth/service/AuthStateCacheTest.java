package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.khatiyan.a_auth.model.AuthUser;
import com.khatiyan.a_auth.model.SessionState;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.model.UserSession;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.a_auth.repository.UserSessionRepository;
import com.khatiyan.c_shared.valkey.CacheFieldCipher;
import com.khatiyan.c_shared.valkey.ValkeyHealth;
import com.khatiyan.c_shared.valkey.ValkeyOutageListener;

/** The cache behind every signed-in request (2026-10-18). */
class AuthStateCacheTest {

    private static final Instant NOW = Instant.parse("2026-10-18T06:00:00Z");

    private long nowNanos = 1_000_000_000L;
    private final List<ValkeyOutageListener> listeners = new ArrayList<>();
    private final ValkeyHealth health = new ValkeyHealth(() -> listeners, () -> nowNanos);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final StringRedisTemplate valkey = mock(StringRedisTemplate.class);
    private final UserRepository users = mock(UserRepository.class);
    private final UserSessionRepository sessions = mock(UserSessionRepository.class);
    private final CacheFieldCipher cipher = CacheFieldCipher.random();
    private AuthStateCache cache;

    private final User user = User.create("+919800000011", "Asha Roy", UserRole.USER);
    private final UUID jti = UUID.randomUUID();
    private final UserSession session =
            UserSession.opened(UUID.randomUUID(), jti, "Pixel 8", "phone", NOW, Instant.now().plus(Duration.ofHours(1)));

    @BeforeEach
    void setUp() {
        when(valkey.opsForValue()).thenReturn(values);
        when(values.increment(AuthStateCache.GENERATION_KEY)).thenReturn(7L);
        when(values.multiGet(anyList())).thenReturn(Arrays.asList(null, null));
        when(users.findById(any())).thenReturn(Optional.of(user));
        when(sessions.findByJti(jti)).thenReturn(Optional.of(session));
        cache = new AuthStateCache(valkey, health, users, sessions, cipher);
        listeners.add(cache);
    }

    private void valkeyStopsAnswering() {
        RedisConnectionFailureException down = new RedisConnectionFailureException("timed out");
        when(values.multiGet(anyList())).thenThrow(down);
        doThrow(down).when(values).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void aMissIsReadFromTheDatabaseOnceAndWrittenOnlyIfAbsent() {
        AuthStateCache.Snapshot state = cache.lookup(user.getId(), jti);

        assertThat(state.user()).contains(AuthUser.of(user));
        assertThat(state.session().revoked()).isFalse();
        verify(values).setIfAbsent(startsWith("khatiyan:auth:g7:user:"), anyString(), any(Duration.class));
        verify(values).setIfAbsent(eq("khatiyan:auth:g7:session:" + jti), startsWith("L|"), any(Duration.class));
        verify(values, never()).set(startsWith("khatiyan:auth:g7:"), anyString(), any(Duration.class));
    }

    @Test
    void aHitReadsNoRow() {
        when(values.multiGet(anyList())).thenReturn(Arrays.asList(
                AuthStateCache.encodeUser(Optional.of(AuthUser.of(user)), cipher),
                AuthStateCache.encodeSession(SessionState.of(session))));

        AuthStateCache.Snapshot state = cache.lookup(user.getId(), jti);

        assertThat(state.user()).contains(AuthUser.of(user));
        verify(users, never()).findById(any());
        verify(sessions, never()).findByJti(any());
    }

    /** Fills write only if absent, so a stale fill landing after the sign-out loses to it. */
    @Test
    void aSignOutAlwaysOverwrites() {
        cache.lookup(user.getId(), jti);

        cache.sessionRevoked(jti, session.getExpiresAt());

        verify(values).set(eq("khatiyan:auth:g7:session:" + jti), startsWith("R|"), any(Duration.class));
    }

    @Test
    void whileValkeyIsDownEachRecordIsReadFromTheDatabaseOnceThenFromMemory() {
        cache.lookup(user.getId(), jti);
        valkeyStopsAnswering();

        cache.lookup(user.getId(), jti);
        cache.lookup(user.getId(), jti);

        // Once for the Valkey fill before the outage, once for memory after it.
        verify(users, times(2)).findById(user.getId());
        verify(sessions, times(2)).findByJti(jti);
    }

    @Test
    void aSignOutDuringAnOutageIsSeenAtOnceFromMemory() {
        cache.lookup(user.getId(), jti);
        valkeyStopsAnswering();
        cache.lookup(user.getId(), jti);

        cache.sessionRevoked(jti, session.getExpiresAt());

        assertThat(cache.lookup(user.getId(), jti).session().revoked()).isTrue();
    }

    @Test
    void comingBackRaisesTheGenerationSoNothingFromBeforeIsRead() {
        cache.lookup(user.getId(), jti);
        valkeyStopsAnswering();
        cache.lookup(user.getId(), jti);

        // Valkey answers again.
        org.mockito.Mockito.reset(values);
        when(values.increment(AuthStateCache.GENERATION_KEY)).thenReturn(8L);
        when(values.multiGet(anyList())).thenReturn(Arrays.asList(null, null));
        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos();

        cache.lookup(user.getId(), jti);

        verify(values).multiGet(List.of("khatiyan:auth:g8:user:" + user.getId(), "khatiyan:auth:g8:session:" + jti));
    }

    @Test
    void aTokenWithNoSessionIdIsNeverRevoked() {
        AuthStateCache.Snapshot state = cache.lookup(user.getId(), null);

        assertThat(state.session()).isEqualTo(SessionState.UNKNOWN);
        assertThat(state.session().revoked()).isFalse();
    }

    @Test
    void anInactiveOrMissingUserIsCachedAsAbsent() {
        when(users.findById(any())).thenReturn(Optional.empty());

        assertThat(cache.lookup(UUID.randomUUID(), jti).user()).isEmpty();
        verify(values).setIfAbsent(startsWith("khatiyan:auth:g7:user:"), eq("0"), any(Duration.class));
    }

    @Test
    void entriesSurviveARoundTripAndCorruptOnesAreMisses() {
        Optional<AuthUser> active = Optional.of(AuthUser.of(user));
        assertThat(AuthStateCache.decodeUser(AuthStateCache.encodeUser(active, cipher), cipher)).contains(active);
        assertThat(AuthStateCache.decodeUser("0", cipher)).contains(Optional.empty());
        assertThat(AuthStateCache.decodeUser("1|x", cipher)).isEmpty();
        // The phone is kept but sealed: nothing in Valkey reads as a phone number (user, 2026-10-27).
        String stored = AuthStateCache.encodeUser(active, cipher);
        assertThat(stored).doesNotContain(active.get().phone()).doesNotContain("+91").contains("|enc:");
        // Another backend's key, or a plain phone written before, cannot be opened: a miss, not an error.
        assertThat(AuthStateCache.decodeUser(stored, CacheFieldCipher.random())).isEmpty();
        assertThat(AuthStateCache.decodeUser(stored.substring(0, stored.indexOf("|enc:")) + "|+919876543210", cipher)).isEmpty();

        SessionState revoked = SessionState.revoked(Instant.ofEpochMilli(NOW.toEpochMilli()));
        assertThat(AuthStateCache.decodeSession(AuthStateCache.encodeSession(revoked))).contains(revoked);
        assertThat(AuthStateCache.decodeSession("N")).contains(SessionState.UNKNOWN);
        assertThat(AuthStateCache.decodeSession("R|later")).isEmpty();
    }
}
