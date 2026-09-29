package com.khatiyan.c_shared.rate_limit;

import java.time.Duration;
import java.util.function.LongSupplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumes tokens from rate-limit buckets: Valkey's, or the database's when
 * Valkey cannot be reached.
 *
 * <p>Every limit in the app comes through here — the API-wide one, the
 * per-route ones, sign-up and email codes, chat, geocoding, the AI quota — so
 * the fallback here covers all of them at once. The database buckets are the
 * same shape and the same numbers (see {@link TokenBucket}), so which store
 * answered makes no difference to the person asking.
 *
 * <p><b>A circuit breaker in front of Valkey.</b> Its timeout is two seconds.
 * Without the breaker, every request during an outage would wait out those
 * two seconds before falling back — the limiter surviving the outage by making
 * the whole API crawl through it. After one failure Valkey is skipped for
 * {@link #VALKEY_RETRY_AFTER}, then tried again.
 *
 * <p>The two stores do not share state. When Valkey returns, its buckets are as
 * it left them and know nothing of what was spent against the database in
 * between. That is a window of fresh allowance right after a recovery, and it
 * is accepted: nobody outside can choose when Valkey goes down.
 */
@Slf4j
@Service
public class RateLimitService {

    static final Duration VALKEY_RETRY_AFTER = Duration.ofSeconds(10);

    private final ProxyManager<String> proxyManager;
    private final DatabaseRateLimiter databaseRateLimiter;
    private final LongSupplier nanoClock;
    /** Until when Valkey is not asked. Zero while it is healthy. */
    private volatile long skipValkeyUntil = 0L;

    @Autowired
    public RateLimitService(ProxyManager<String> proxyManager, DatabaseRateLimiter databaseRateLimiter) {
        this(proxyManager, databaseRateLimiter, System::nanoTime);
    }

    /** With a clock of our choosing, so the breaker can be tested without sleeping. */
    RateLimitService(ProxyManager<String> proxyManager, DatabaseRateLimiter databaseRateLimiter, LongSupplier nanoClock) {
        this.proxyManager = proxyManager;
        this.databaseRateLimiter = databaseRateLimiter;
        this.nanoClock = nanoClock;
    }

    public RateLimitResult consume(String key, int attempts, int durationSeconds) {
        if (nanoClock.getAsLong() < skipValkeyUntil) {
            return databaseRateLimiter.consume(key, attempts, durationSeconds);
        }
        try {
            return consumeFromValkey(key, attempts, durationSeconds);
        } catch (RuntimeException valkeyFailure) {
            // Any failure here means the answer did not come from Valkey — a
            // refused connection, a timeout, a command error. The database can
            // still answer the same question, so it is asked; whatever it says
            // stands. Only if it ALSO fails does the exception travel on, to
            // the filter's fail-open or the caller.
            skipValkeyUntil = nanoClock.getAsLong() + VALKEY_RETRY_AFTER.toNanos();
            log.warn(
                    "Valkey rate limiter unavailable; using the database for {}s key={} reason={}",
                    VALKEY_RETRY_AFTER.toSeconds(), key, valkeyFailure.getMessage());
            return databaseRateLimiter.consume(key, attempts, durationSeconds);
        }
    }

    public void consumeOrThrow(String key, int attempts, int durationSeconds, String message) {
        RateLimitResult result = consume(key, attempts, durationSeconds);
        if (!result.allowed()) {
            throw new ValidationException(message);
        }
    }

    private RateLimitResult consumeFromValkey(String key, int attempts, int durationSeconds) {
        Bucket bucket = proxyManager.getProxy(key, () -> configuration(attempts, durationSeconds));
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return RateLimitResult.allowed(probe.getRemainingTokens());
        }
        long retryAfterSeconds = Math.max(
                1,
                Duration.ofNanos(probe.getNanosToWaitForRefill()).toSeconds());
        return RateLimitResult.rejected(retryAfterSeconds);
    }

    /** Package-visible so the database fallback's arithmetic can be checked against it. */
    static BucketConfiguration configuration(int attempts, int durationSeconds) {
        return BucketConfiguration.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(attempts)
                        .refillGreedy(attempts, Duration.ofSeconds(durationSeconds))
                        .build())
                .build();
    }
}
