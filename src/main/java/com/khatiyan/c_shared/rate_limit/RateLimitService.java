package com.khatiyan.c_shared.rate_limit;

import java.time.Duration;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.valkey.ValkeyHealth;
import com.khatiyan.c_shared.valkey.ValkeyOutageListener;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.proxy.ProxyManager;

/**
 * Consumes tokens from rate-limit buckets: Valkey's while it is up, this
 * backend's own memory while it is not (2026-10-18).
 *
 * <p>Every limit in the app comes through here — the API-wide one, the
 * per-route ones, sign-up and email codes, chat, geocoding, the AI quota — so
 * the fallback here covers all of them at once. Both stores run the same
 * Bucket4j bucket with the same numbers, so which one answered makes no
 * difference to the person asking.
 *
 * <p><b>Memory, not the database.</b> The database fallback wrote a row on
 * every request during an outage. These are abuse limits, and the ones that
 * guard money or accounts live elsewhere: OTP pauses in an outage and PIN
 * lockout is counted from {@code auth.login_attempts}. So the memory buckets
 * accept two things: they start fresh after a restart during an outage, and
 * each running copy of the backend counts on its own.
 *
 * <p>When Valkey goes down or comes back the memory buckets are emptied, and
 * Valkey's buckets are as it left them. {@link ValkeyHealth} decides when
 * Valkey may be asked, so an outage does not make every request wait out its
 * two-second timeout.
 */
@Service
public class RateLimitService implements ValkeyOutageListener {

    /** Plenty for every IP and person active during an outage, and a bound on the heap. */
    static final long MAX_MEMORY_BUCKETS = 100_000;

    /**
     * Valkey's buckets, made on first use (2026-10-17). A failure to connect
     * comes out of here as any other Valkey failure, inside the fallback.
     */
    private final Supplier<ProxyManager<String>> proxyManager;
    private final ValkeyHealth health;
    /**
     * Kept for as long as the bucket takes to refill, counted from its last use.
     * A bucket untouched that long is full, so dropping it changes nothing.
     */
    private final Cache<String, MemoryBucket> memory = Caffeine.newBuilder()
            .maximumSize(MAX_MEMORY_BUCKETS)
            .expireAfter(new Expiry<String, MemoryBucket>() {
                @Override
                public long expireAfterCreate(String key, MemoryBucket bucket, long currentTime) {
                    return bucket.refillNanos();
                }

                @Override
                public long expireAfterUpdate(String key, MemoryBucket bucket, long currentTime, long currentDuration) {
                    return bucket.refillNanos();
                }

                @Override
                public long expireAfterRead(String key, MemoryBucket bucket, long currentTime, long currentDuration) {
                    return bucket.refillNanos();
                }
            })
            .build();

    @Autowired
    public RateLimitService(ObjectProvider<ProxyManager<String>> proxyManager, ValkeyHealth health) {
        this(proxyManager::getObject, health);
    }

    /** With Valkey's buckets made on demand, as the app has them. */
    RateLimitService(Supplier<ProxyManager<String>> proxyManager, ValkeyHealth health) {
        this.proxyManager = proxyManager;
        this.health = health;
    }

    public RateLimitResult consume(String key, int attempts, int durationSeconds) {
        if (health.available()) {
            try {
                return consumeFromValkey(key, attempts, durationSeconds);
            } catch (RuntimeException valkeyFailure) {
                // A refused connection, a timeout, a command error: the answer
                // did not come from Valkey. Memory answers the same question.
                health.failed(valkeyFailure);
            }
        }
        return consumeFromMemory(key, attempts, durationSeconds);
    }

    public void consumeOrThrow(String key, int attempts, int durationSeconds, String message) {
        RateLimitResult result = consume(key, attempts, durationSeconds);
        if (!result.allowed()) {
            throw new ValidationException(message);
        }
    }

    @Override
    public void onValkeyDown() {
        memory.invalidateAll();
    }

    @Override
    public void onValkeyRecovering() {
        memory.invalidateAll();
    }

    private RateLimitResult consumeFromValkey(String key, int attempts, int durationSeconds) {
        Bucket bucket = proxyManager.get().getProxy(key, () -> configuration(attempts, durationSeconds));
        return resultOf(bucket.tryConsumeAndReturnRemaining(1));
    }

    private RateLimitResult consumeFromMemory(String key, int attempts, int durationSeconds) {
        MemoryBucket bucket = memory.get(key, ignored -> new MemoryBucket(
                Bucket.builder().addLimit(bandwidth(attempts, durationSeconds)).build(),
                Duration.ofSeconds(durationSeconds).toNanos()));
        return resultOf(bucket.bucket().tryConsumeAndReturnRemaining(1));
    }

    private static RateLimitResult resultOf(ConsumptionProbe probe) {
        if (probe.isConsumed()) {
            return RateLimitResult.allowed(probe.getRemainingTokens());
        }
        long retryAfterSeconds = Math.max(
                1,
                Duration.ofNanos(probe.getNanosToWaitForRefill()).toSeconds());
        return RateLimitResult.rejected(retryAfterSeconds);
    }

    /** Package-visible so the database bucket's arithmetic can be checked against it. */
    static BucketConfiguration configuration(int attempts, int durationSeconds) {
        return BucketConfiguration.builder()
                .addLimit(bandwidth(attempts, durationSeconds))
                .build();
    }

    private static Bandwidth bandwidth(int attempts, int durationSeconds) {
        return Bandwidth.builder()
                .capacity(attempts)
                .refillGreedy(attempts, Duration.ofSeconds(durationSeconds))
                .build();
    }

    /** Buckets held in memory. For tests. */
    long memoryBuckets() {
        memory.cleanUp();
        return memory.estimatedSize();
    }

    private record MemoryBucket(Bucket bucket, long refillNanos) {
    }
}
