package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.c_shared.valkey.ValkeyHealth;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.QueryCount;

import io.lettuce.core.event.connection.DisconnectedEvent;
import io.lettuce.core.resource.ClientResources;

/**
 * The auth cache in the real app, on real Postgres and Valkey (2026-10-18).
 */
@IntegrationTest
class AuthStateCacheIntegrationTest {

    @Autowired private AuthStateCache cache;
    @Autowired private UserSessionService sessions;
    @Autowired private UserRepository users;
    @Autowired private ValkeyHealth health;
    @Autowired private ClientResources clientResources;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;
    private UUID userId;
    private UUID jti;

    @BeforeEach
    void signIn() {
        tx = new TransactionTemplate(transactionManager);
        String phone = "+9198" + String.format("%08d", Math.floorMod(UUID.randomUUID().hashCode(), 100_000_000));
        userId = tx.execute(status -> users.save(User.create(phone, "Cache Test", UserRole.USER)).getId());
        jti = UUID.randomUUID();
        Instant now = Instant.now();
        tx.executeWithoutResult(status -> sessions.open(userId, jti, "Pixel 8", "phone", now, now.plus(Duration.ofHours(1))));
    }

    @AfterEach
    void removeFixture() {
        jdbc.update("DELETE FROM auth.user_sessions WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM auth.users WHERE id = ?", userId);
    }

    @Test
    void onceCachedASignedInRequestReadsNoRow() {
        cache.lookup(userId, jti);

        long queries = QueryCount.of(() -> cache.lookup(userId, jti));

        assertThat(queries).isZero();
    }

    /** Through the entity listener, after commit: a new PIN kills old tokens at once. */
    @Test
    void aNewPinReachesTheCacheWithoutReadingTheRow() {
        int before = cache.lookup(userId, jti).user().orElseThrow().credentialVersion();

        tx.executeWithoutResult(status -> users.findById(userId).orElseThrow().setPin("hash-of-a-new-pin"));

        long[] after = new long[1];
        long queries = QueryCount.of(() -> after[0] = cache.lookup(userId, jti).user().orElseThrow().credentialVersion());
        assertThat(after[0]).isEqualTo(before + 1);
        assertThat(queries).isZero();
    }

    @Test
    void aSignOutIsSeenOnTheNextRequest() {
        cache.lookup(userId, jti);

        tx.executeWithoutResult(status -> sessions.revokeOwn(userId, jti, Instant.now()));

        assertThat(cache.lookup(userId, jti).session().revoked()).isTrue();
    }

    /**
     * A sign-out whose Valkey write was lost in an outage: the row says signed
     * out, Valkey's copy says live. Raising the generation on recovery is what
     * makes the row win.
     */
    @Test
    void afterARecoveryNothingCachedBeforeItIsTrusted() {
        cache.lookup(userId, jti);
        jdbc.update("UPDATE auth.user_sessions SET revoked_at = now() WHERE jti = ?", jti);
        assertThat(cache.lookup(userId, jti).session().revoked()).isFalse();

        cache.onValkeyRecovering();

        assertThat(cache.lookup(userId, jti).session().revoked()).isTrue();
    }

    /** Valkey restarting with an old copy while nobody asked: the dropped connection counts. */
    @Test
    void aDroppedConnectionMarksValkeyDownUntilItIsBroughtBack() throws Exception {
        assertThat(health.available()).isTrue();

        clientResources.eventBus().publish(new DisconnectedEvent(
                new InetSocketAddress("127.0.0.1", 50000), new InetSocketAddress("127.0.0.1", 6379)));

        // Lettuce hands events to subscribers on its own threads.
        long heard = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (health.available() && System.nanoTime() < heard) {
            Thread.sleep(20);
        }
        assertThat(health.available()).isFalse();
        // Signed-in requests keep working from the database meanwhile.
        assertThat(cache.lookup(userId, jti).user()).isPresent();

        // Brought back after the pause, so later suites in this context find it up.
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (!health.available() && System.nanoTime() < deadline) {
            Thread.sleep(250);
        }
        assertThat(health.available()).isTrue();
    }
}
