package com.khatiyan.c_shared.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/** Valkey while it is up, memory while it is not (2026-10-18). */
class FallbackCacheTest {

    private static final Duration TTL = Duration.ofHours(1);

    private long nowNanos = 1_000_000_000L;
    private final List<ValkeyOutageListener> listeners = new ArrayList<>();
    private final ValkeyHealth health = new ValkeyHealth(() -> listeners, () -> nowNanos);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final StringRedisTemplate valkey = mock(StringRedisTemplate.class);
    private FallbackCache cache;

    @BeforeEach
    void setUp() {
        when(valkey.opsForValue()).thenReturn(values);
        cache = new FallbackCache(valkey, health);
        listeners.add(cache);
    }

    private void valkeyStopsAnswering() {
        RedisConnectionFailureException down = new RedisConnectionFailureException("timed out");
        when(values.get(anyString())).thenThrow(down);
        doThrow(down).when(values).set(anyString(), anyString(), any(Duration.class));
        when(values.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenThrow(down);
    }

    @Test
    void whileValkeyIsUpItIsTheCacheAndMemoryHoldsNothing() {
        when(values.get("geo:search:x")).thenReturn("[]");

        cache.set("geo:search:x", "[]", TTL);

        assertThat(cache.get("geo:search:x")).isEqualTo("[]");
        verify(values).set("geo:search:x", "[]", TTL);
        assertThat(cache.memoryEntries()).isZero();
    }

    @Test
    void aValkeyFailureIsAnsweredFromMemoryOnTheSameCall() {
        cache.get("warm-up");
        valkeyStopsAnswering();

        cache.set("geo:search:x", "[1]", TTL);

        assertThat(cache.get("geo:search:x")).isEqualTo("[1]");
        assertThat(cache.memoryEntries()).isOne();
    }

    @Test
    void whileDownValkeyIsNotAskedAtAll() {
        cache.get("warm-up");
        valkeyStopsAnswering();
        cache.get("first");

        cache.set("geo:search:x", "[1]", TTL);
        cache.get("geo:search:x");

        verify(values, never()).set("geo:search:x", "[1]", TTL);
        verify(values, never()).get("geo:search:x");
    }

    @Test
    void theCooldownWritesOnceInMemoryToo() {
        cache.get("warm-up");
        valkeyStopsAnswering();

        assertThat(cache.setIfAbsent("chat:pushed:t:u", "1", Duration.ofMinutes(5))).isTrue();
        assertThat(cache.setIfAbsent("chat:pushed:t:u", "1", Duration.ofMinutes(5))).isFalse();
    }

    @Test
    void memoryFromOneOutageIsGoneWhenValkeyComesBack() {
        cache.get("warm-up");
        valkeyStopsAnswering();
        cache.set("geo:search:x", "[1]", TTL);
        assertThat(cache.memoryEntries()).isOne();

        // Valkey answers again: the recovery empties memory before it is used.
        org.mockito.Mockito.doReturn(null).when(values).get(anyString());
        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos();
        assertThat(cache.get("geo:search:x")).isNull();
        assertThat(cache.memoryEntries()).isZero();
    }
}
