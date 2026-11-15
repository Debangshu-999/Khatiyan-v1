package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.a_auth.api.dto.TokenResponse;
import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.support.IntegrationTest;

/**
 * Renewing a session, through the real service, on real Postgres and Valkey (user, 2026-11-02).
 */
@IntegrationTest
class RefreshTokenIntegrationTest {

    @Autowired private AuthService auth;
    @Autowired private AuthStateCache cache;
    @Autowired private JwtService jwt;
    @Autowired private UserSessionService sessions;
    @Autowired private UserRepository users;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;
    private UUID userId;
    private UUID jti;
    private String refreshToken;

    @BeforeEach
    void signIn() {
        tx = new TransactionTemplate(transactionManager);
        String phone = "+9197" + String.format("%08d", Math.floorMod(UUID.randomUUID().hashCode(), 100_000_000));
        userId = tx.execute(status -> users.save(User.create(phone, "Refresh Test", UserRole.USER)).getId());
        jti = UUID.randomUUID();
        refreshToken = sessions.open(userId, jti, "Pixel 8", "phone", Instant.now());
    }

    @AfterEach
    void removeFixture() {
        jdbc.update("DELETE FROM auth.user_sessions WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM auth.users WHERE id = ?", userId);
    }

    @Test
    void aRenewalKeepsTheSameSessionAndChangesBothTokens() {
        TokenResponse renewed = auth.refresh(refreshToken).orElseThrow();

        assertThat(renewed.refreshToken()).isNotEqualTo(refreshToken);
        // The same jti: signing this device out ends every token it was ever given.
        assertThat(jwt.parse(renewed.accessToken()).sessionId()).isEqualTo(jti);
        assertThat(jwt.parse(renewed.accessToken()).userId()).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM auth.user_sessions WHERE user_id = ?", Long.class, userId)).isEqualTo(1);
        assertThat(auth.refresh(renewed.refreshToken())).isPresent();
    }

    @Test
    void aTokenUsedAgainLongAfterEndsTheSession() {
        auth.refresh(refreshToken).orElseThrow();
        jdbc.update("UPDATE auth.user_sessions SET previous_refresh_rotated_at = now() - interval '5 minutes' WHERE jti = ?", jti);

        assertThat(auth.refresh(refreshToken)).isEmpty();

        // It stays ended though the call found nothing to return, and tokens already out die with it.
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth.user_sessions WHERE jti = ?", Boolean.class, jti)).isTrue();
        assertThat(cache.lookup(userId, jti).session().revoked()).isTrue();
    }

    @Test
    void theSameDeviceSigningInAgainReplacesItsOldSession() {
        UUID other = UUID.randomUUID();
        sessions.open(userId, other, "Web browser", "web", Instant.now());
        UUID again = UUID.randomUUID();

        sessions.open(userId, again, "Pixel 8", "phone", Instant.now());

        assertThat(revoked(jti)).isTrue();
        assertThat(cache.lookup(userId, jti).session().revoked()).isTrue();
        assertThat(revoked(other)).isFalse();
        assertThat(revoked(again)).isFalse();
        assertThat(auth.refresh(refreshToken)).isEmpty();
    }

    @Test
    void aBlankNameOrAnotherPlatformIsNotTheSameDevice() {
        sessions.replaceSameDevice(userId, " ", "phone", Instant.now());
        sessions.replaceSameDevice(userId, "Pixel 8", "web", Instant.now());

        assertThat(revoked(jti)).isFalse();
    }

    private boolean revoked(UUID sessionJti) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT revoked_at IS NOT NULL FROM auth.user_sessions WHERE jti = ?", Boolean.class, sessionJti));
    }

    @Test
    void aSignedOutDeviceCannotRenew() {
        sessions.revokeOwn(userId, jti, Instant.now());

        assertThat(auth.refresh(refreshToken)).isEmpty();
    }

    @Test
    void aDeactivatedPersonCannotRenew() {
        jdbc.update("UPDATE auth.users SET is_active = false WHERE id = ?", userId);

        assertThat(auth.refresh(refreshToken)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth.user_sessions WHERE jti = ?", Boolean.class, jti)).isTrue();
    }
}
