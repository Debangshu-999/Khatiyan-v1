package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.model.UserSession;
import com.khatiyan.a_auth.repository.UserSessionRepository;

class RefreshTokenRotationTest {

    private static final Instant NOW = Instant.parse("2026-11-02T10:00:00Z");
    private static final UUID USER = UUID.randomUUID();

    private UserSessionRepository repository;
    private AuthStateCache cache;
    private UserSessionService service;

    @BeforeEach
    void setUp() {
        repository = mock(UserSessionRepository.class);
        cache = mock(AuthStateCache.class);
        service = new UserSessionService(repository, cache, mock(ApplicationEventPublisher.class), 4, 30);
    }

    private UserSession session(String token, Instant expiresAt) {
        UserSession session = UserSession.opened(
                USER, UUID.randomUUID(), "Pixel 8", "phone", NOW.minus(Duration.ofDays(1)), expiresAt, UserSessionService.hash(token));
        when(repository.findByRefreshTokenHash(UserSessionService.hash(token))).thenReturn(Optional.of(session));
        return session;
    }

    @Test
    void openingStoresOnlyTheHash() {
        String token = service.open(USER, UUID.randomUUID(), "Pixel 8", "phone", NOW);

        ArgumentCaptor<UserSession> saved = ArgumentCaptor.forClass(UserSession.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getRefreshTokenHash()).isEqualTo(UserSessionService.hash(token)).isNotEqualTo(token);
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(NOW.plus(Duration.ofDays(30)));
    }

    @Test
    void aGoodTokenIsReplacedAndTheSessionIsKeptGoing() {
        UserSession session = session("first", NOW.plus(Duration.ofDays(1)));

        Optional<UserSessionService.RotatedRefresh> rotated = service.rotate("first", NOW);

        assertThat(rotated).isPresent();
        assertThat(rotated.get().sessionId()).isEqualTo(session.getJti());
        assertThat(rotated.get().refreshToken()).isNotEqualTo("first");
        assertThat(session.getRefreshTokenHash()).isEqualTo(UserSessionService.hash(rotated.get().refreshToken()));
        assertThat(session.getPreviousRefreshTokenHash()).isEqualTo(UserSessionService.hash("first"));
        assertThat(session.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofDays(30)));
    }

    @Test
    void anUnknownTokenIsRefused() {
        when(repository.findByRefreshTokenHash(any())).thenReturn(Optional.empty());
        when(repository.findByPreviousRefreshTokenHash(any())).thenReturn(Optional.empty());

        assertThat(service.rotate("made up", NOW)).isEmpty();
    }

    @Test
    void anExpiredOrSignedOutSessionIsRefused() {
        session("old", NOW.minusSeconds(1));
        assertThat(service.rotate("old", NOW)).isEmpty();

        UserSession signedOut = session("out", NOW.plus(Duration.ofDays(1)));
        signedOut.revoke(NOW.minusSeconds(5));
        assertThat(service.rotate("out", NOW)).isEmpty();
    }

    private UserSession rotatedAt(Instant when) {
        UserSession session = session("first", NOW.plus(Duration.ofDays(1)));
        service.rotate("first", when);
        when(repository.findByRefreshTokenHash(UserSessionService.hash("first"))).thenReturn(Optional.empty());
        when(repository.findByPreviousRefreshTokenHash(UserSessionService.hash("first"))).thenReturn(Optional.of(session));
        return session;
    }

    @Test
    void theSameTokenSoonAfterIsALostReplyAndStillWorks() {
        UserSession session = rotatedAt(NOW);

        Optional<UserSessionService.RotatedRefresh> again = service.rotate("first", NOW.plusSeconds(10));

        assertThat(again).isPresent();
        assertThat(session.isRevoked()).isFalse();
        assertThat(session.getRefreshTokenHash()).isEqualTo(UserSessionService.hash(again.get().refreshToken()));
        verify(cache, never()).sessionRevoked(any(), any());
    }

    @Test
    void theGraceIsNotExtendedByUsingIt() {
        UserSession session = rotatedAt(NOW);
        service.rotate("first", NOW.plusSeconds(20));

        assertThat(service.rotate("first", NOW.plusSeconds(40))).isEmpty();
        assertThat(session.isRevoked()).isTrue();
    }

    @Test
    void theSameTokenLaterMeansItWasCopiedAndTheSessionEnds() {
        UserSession session = rotatedAt(NOW);

        assertThat(service.rotate("first", NOW.plus(Duration.ofMinutes(5)))).isEmpty();
        assertThat(session.isRevoked()).isTrue();
        verify(cache).sessionRevoked(eq(session.getJti()), any());
    }
}
