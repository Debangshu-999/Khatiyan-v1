package com.khatiyan.c_shared.rate_limit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.proxy.ProxyManager;

/**
 * Every limit keeps working through a Valkey outage.
 *
 * <p>The API-wide and per-route limits used to switch off when Valkey was
 * down — the filter failed open — while only OTP sending had a database
 * fallback. They now fall back too, and a circuit breaker stops each request
 * paying Valkey's two-second timeout on the way.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RateLimitServiceFallbackTest {

    private static final String KEY = "rl:default:ip:203.0.113.7";

    @Mock private ProxyManager<String> proxyManager;
    @Mock private BucketProxy bucket;
    @Mock private DatabaseRateLimiter database;

    private long nowNanos;
    private RateLimitService service;

    @BeforeEach
    void setUp() {
        nowNanos = 1_000_000_000L;
        service = new RateLimitService(proxyManager, database, () -> nowNanos);
        when(database.consume(anyString(), anyInt(), anyInt())).thenReturn(RateLimitResult.rejected(40));
    }

    private void valkeyIsDown() {
        when(proxyManager.getProxy(anyString(), any())).thenThrow(new RuntimeException("Connection refused"));
    }

    private void valkeyIsUp() {
        // doReturn, not when(): re-stubbing a mock that is currently set to
        // throw would call it — and throw — while being re-stubbed.
        doReturn(bucket).when(proxyManager).getProxy(anyString(), any());
        when(bucket.tryConsumeAndReturnRemaining(1)).thenReturn(ConsumptionProbe.consumed(299, 0));
    }

    @Test
    void whileValkeyIsHealthyTheDatabaseIsNeverAsked() {
        valkeyIsUp();

        RateLimitResult result = service.consume(KEY, 300, 60);

        assertThat(result.allowed()).isTrue();
        verify(database, never()).consume(anyString(), anyInt(), anyInt());
    }

    /** The database's answer stands — including a refusal. Failing over is not failing open. */
    @Test
    void whenValkeyFailsTheDatabaseAnswersWithTheSameLimit() {
        valkeyIsDown();

        RateLimitResult result = service.consume(KEY, 300, 60);

        assertThat(result.allowed()).isFalse();
        assertThat(result.retryAfterSeconds()).isEqualTo(40);
        verify(database).consume(KEY, 300, 60);
    }

    @Test
    void afterAFailureValkeyIsSkippedForTenSeconds() {
        valkeyIsDown();

        service.consume(KEY, 300, 60);
        nowNanos += Duration.ofSeconds(9).toNanos();
        service.consume(KEY, 300, 60);

        verify(proxyManager, times(1)).getProxy(anyString(), any());
        verify(database, times(2)).consume(KEY, 300, 60);
    }

    @Test
    void afterTenSecondsValkeyIsTriedAgain() {
        valkeyIsDown();
        service.consume(KEY, 300, 60);

        valkeyIsUp();
        nowNanos += Duration.ofSeconds(11).toNanos();
        RateLimitResult result = service.consume(KEY, 300, 60);

        assertThat(result.allowed()).isTrue();
        verify(proxyManager, times(2)).getProxy(anyString(), any());
    }

    /** Both stores down: the failure travels on, to the filter's fail-open or the caller. */
    @Test
    void whenBothStoresFailTheFailureIsNotSwallowed() {
        valkeyIsDown();
        when(database.consume(anyString(), anyInt(), anyInt())).thenThrow(new RuntimeException("database down"));

        assertThatThrownBy(() -> service.consume(KEY, 300, 60)).hasMessageContaining("database down");
    }
}
