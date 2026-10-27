package com.khatiyan.c_shared.valkey;

import java.time.Duration;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;

/**
 * A string cache that is Valkey while Valkey is up and memory while it is not
 * (2026-10-18).
 *
 * <p>For caches whose source is somewhere else (a vendor, the AI) and for the
 * chat push cooldown. Never throws: a Valkey failure marks it down in
 * {@link ValkeyHealth} and the same call is answered from memory.
 *
 * <p>Memory is emptied when Valkey goes down and again when it comes back, so
 * it only ever holds what was written during the current outage. Each entry
 * keeps its own expiry, and the whole is capped so an outage cannot fill the
 * heap.
 */
@Component
public class FallbackCache implements ValkeyOutageListener {

    static final long MAX_ENTRIES = 20_000;

    private final StringRedisTemplate valkey;
    private final ValkeyHealth health;
    private final Cache<String, Entry> memory = Caffeine.newBuilder()
            .maximumSize(MAX_ENTRIES)
            .expireAfter(new Expiry<String, Entry>() {
                @Override
                public long expireAfterCreate(String key, Entry entry, long currentTime) {
                    return entry.ttlNanos();
                }

                @Override
                public long expireAfterUpdate(String key, Entry entry, long currentTime, long currentDuration) {
                    return entry.ttlNanos();
                }

                @Override
                public long expireAfterRead(String key, Entry entry, long currentTime, long currentDuration) {
                    return currentDuration;
                }
            })
            .build();

    public FallbackCache(StringRedisTemplate valkey, ValkeyHealth health) {
        this.valkey = valkey;
        this.health = health;
    }

    /** The value, or null when there is none. */
    public String get(String key) {
        if (health.available()) {
            try {
                return valkey.opsForValue().get(key);
            } catch (RuntimeException valkeyFailure) {
                health.failed(valkeyFailure);
            }
        }
        Entry entry = memory.getIfPresent(key);
        return entry == null ? null : entry.value();
    }

    public void set(String key, String value, Duration ttl) {
        if (health.available()) {
            try {
                valkey.opsForValue().set(key, value, ttl);
                return;
            } catch (RuntimeException valkeyFailure) {
                health.failed(valkeyFailure);
            }
        }
        memory.put(key, new Entry(value, ttl.toNanos()));
    }

    /** Writes only when nothing is there. True when this call wrote it. */
    public boolean setIfAbsent(String key, String value, Duration ttl) {
        if (health.available()) {
            try {
                return Boolean.TRUE.equals(valkey.opsForValue().setIfAbsent(key, value, ttl));
            } catch (RuntimeException valkeyFailure) {
                health.failed(valkeyFailure);
            }
        }
        return memory.asMap().putIfAbsent(key, new Entry(value, ttl.toNanos())) == null;
    }

    @Override
    public void onValkeyDown() {
        memory.invalidateAll();
    }

    @Override
    public void onValkeyRecovering() {
        memory.invalidateAll();
    }

    /** Entries held in memory. For tests. */
    long memoryEntries() {
        memory.cleanUp();
        return memory.estimatedSize();
    }

    private record Entry(String value, long ttlNanos) {
    }
}
