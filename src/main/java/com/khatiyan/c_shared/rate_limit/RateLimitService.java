package com.khatiyan.c_shared.rate_limit;

import java.time.Duration;

import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.proxy.ProxyManager;

/**
 * Consumes tokens from Valkey-backed Bucket4j buckets.
 */
@Service
public class RateLimitService {

    private final ProxyManager<String> proxyManager;

    public RateLimitService(ProxyManager<String> proxyManager) {
        this.proxyManager = proxyManager;
    }

    public RateLimitResult consume(String key, int attempts, int durationSeconds) {
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

    public void consumeOrThrow(String key, int attempts, int durationSeconds, String message) {
        RateLimitResult result = consume(key, attempts, durationSeconds);
        if (!result.allowed()) {
            throw new ValidationException(message);
        }
    }

    private BucketConfiguration configuration(int attempts, int durationSeconds) {
        return BucketConfiguration.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(attempts)
                        .refillGreedy(attempts, Duration.ofSeconds(durationSeconds))
                        .build())
                .build();
    }
}
