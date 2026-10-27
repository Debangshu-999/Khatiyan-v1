package com.khatiyan.c_shared.rate_limit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.c_shared.valkey.ValkeyHealth;
import com.khatiyan.c_shared.valkey.ValkeyOutageListener;

import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.proxy.ProxyManager;

/**
 * Every limit keeps working through a Valkey outage, counted in memory
 * (2026-10-18).
 *
 * <p>It used to fall back to the database, one write per request. The
 * limits worth being exact about (OTP, PIN lockout) are handled elsewhere, so
 * memory with the same numbers does the job.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RateLimitServiceFallbackTest {

    private static final String KEY = "rl:default:ip:203.0.113.7";

    @Mock private ProxyManager<String> proxyManager;
    @Mock private BucketProxy bucket;

    private long nowNanos;
    private final List<ValkeyOutageListener> listeners = new ArrayList<>();
    private ValkeyHealth health;
    private RateLimitService service;

    @BeforeEach
    void setUp() {
        nowNanos = 1_000_000_000L;
        health = new ValkeyHealth(() -> listeners, () -> nowNanos);
        service = new RateLimitService(() -> proxyManager, health);
        listeners.add(service);
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

    /**
     * The backend would not start when Valkey did not answer for a few seconds
     * at boot (2026-10-17). The connection is opened on first use now, inside
     * the same fallback as every other Valkey failure.
     */
    @Test
    void aValkeyThatDoesNotAnswerAtStartupLeavesTheLimiterOnMemoryUntilItDoes() {
        AtomicInteger connects = new AtomicInteger();
        AtomicBoolean answering = new AtomicBoolean(false);
        RateLimitService lazy = new RateLimitService(() -> {
            connects.incrementAndGet();
            if (!answering.get()) {
                throw new RuntimeException("Connection initialization timed out after 2 second(s)");
            }
            return proxyManager;
        }, health);

        // Building the limiter asks nothing of Valkey.
        assertThat(connects).hasValue(0);

        // First use: Valkey does not answer, memory does.
        assertThat(lazy.consume(KEY, 300, 60).allowed()).isTrue();
        assertThat(connects).hasValue(1);

        // Once it answers, the next try after the pause uses it.
        answering.set(true);
        valkeyIsUp();
        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos() + 1;
        assertThat(lazy.consume(KEY, 300, 60).remainingTokens()).isEqualTo(299);
        assertThat(connects).hasValue(2);
    }

    @Test
    void theValkeyConnectionAndItsBucketsAreMadeOnFirstUseNotAtStartup() throws Exception {
        assertThat(RateLimitConfig.class.getMethod("rateLimitRedisConnection", io.lettuce.core.RedisClient.class)
                .isAnnotationPresent(org.springframework.context.annotation.Lazy.class)).isTrue();
        assertThat(RateLimitConfig.class.getMethod("rateLimitProxyManager", io.lettuce.core.api.StatefulRedisConnection.class)
                .isAnnotationPresent(org.springframework.context.annotation.Lazy.class)).isTrue();
    }

    @Test
    void whileValkeyIsHealthyMemoryHoldsNothing() {
        valkeyIsUp();

        RateLimitResult result = service.consume(KEY, 300, 60);

        assertThat(result.allowed()).isTrue();
        assertThat(service.memoryBuckets()).isZero();
    }

    /** Memory's answer stands, including a refusal. Failing over is not failing open. */
    @Test
    void whenValkeyFailsMemoryAppliesTheSameLimit() {
        valkeyIsDown();

        for (int i = 0; i < 3; i++) {
            assertThat(service.consume(KEY, 3, 60).allowed()).isTrue();
        }
        RateLimitResult fourth = service.consume(KEY, 3, 60);

        assertThat(fourth.allowed()).isFalse();
        assertThat(fourth.retryAfterSeconds()).isBetween(1L, 20L);
    }

    @Test
    void afterAFailureValkeyIsSkippedForTenSeconds() {
        valkeyIsDown();

        service.consume(KEY, 300, 60);
        nowNanos += Duration.ofSeconds(9).toNanos();
        service.consume(KEY, 300, 60);

        verify(proxyManager, times(1)).getProxy(anyString(), any());
    }

    @Test
    void afterTenSecondsValkeyIsTriedAgainAndMemoryIsEmptied() {
        valkeyIsDown();
        service.consume(KEY, 300, 60);
        assertThat(service.memoryBuckets()).isOne();

        valkeyIsUp();
        nowNanos += Duration.ofSeconds(11).toNanos();
        RateLimitResult result = service.consume(KEY, 300, 60);

        assertThat(result.remainingTokens()).isEqualTo(299);
        verify(proxyManager, times(2)).getProxy(anyString(), any());
        assertThat(service.memoryBuckets()).isZero();
    }
}
