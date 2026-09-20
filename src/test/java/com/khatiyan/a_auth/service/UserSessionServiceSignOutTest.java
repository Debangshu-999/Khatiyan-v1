package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.khatiyan.a_auth.model.UserSession;
import com.khatiyan.a_auth.repository.UserSessionRepository;

/**
 * Signing out ends the session on the server, not just on the phone.
 *
 * <p>Reported 2026-09-13: signing in and out of one phone four times hit the
 * four-device cap, because each sign-out left its session live until the token
 * expired.
 */
class UserSessionServiceSignOutTest {

    private static final Instant NOW = Instant.parse("2026-09-13T18:00:00Z");
    private static final UUID USER = UUID.randomUUID();

    private UserSessionRepository repository;
    private ValueOperations<String, String> valkeyValues;
    private StringRedisTemplate valkey;
    private UserSessionService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repository = mock(UserSessionRepository.class);
        valkey = mock(StringRedisTemplate.class);
        valkeyValues = mock(ValueOperations.class);
        when(valkey.opsForValue()).thenReturn(valkeyValues);
        service = new UserSessionService(repository, valkey, mock(ApplicationEventPublisher.class), 4);
    }

    private UserSession liveSession(UUID owner, UUID jti) {
        return UserSession.opened(owner, jti, "Pixel 8", "phone", NOW.minusSeconds(60), NOW.plus(Duration.ofMinutes(59)));
    }

    @Test
    @DisplayName("revokes the caller's own session and blocks its token until expiry")
    void revokesOwnSession() {
        UUID jti = UUID.randomUUID();
        UserSession session = liveSession(USER, jti);
        when(repository.findByJti(jti)).thenReturn(Optional.of(session));

        service.revokeOwn(USER, jti, NOW);

        assertThat(session.isRevoked()).isTrue();
        verify(valkeyValues).set(eq("khatiyan:auth:session-revoked:" + jti), eq("1"), any(Duration.class));
    }

    @Test
    @DisplayName("never touches a session that belongs to someone else")
    void ignoresAnotherUsersSession() {
        UUID jti = UUID.randomUUID();
        UserSession someoneElses = liveSession(UUID.randomUUID(), jti);
        when(repository.findByJti(jti)).thenReturn(Optional.of(someoneElses));

        service.revokeOwn(USER, jti, NOW);

        assertThat(someoneElses.isRevoked()).isFalse();
        verify(valkeyValues, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    @DisplayName("a token from before sessions existed signs out without error")
    void nullSessionIsANoOp() {
        service.revokeOwn(USER, null, NOW);

        verifyNoInteractions(repository);
    }
}
