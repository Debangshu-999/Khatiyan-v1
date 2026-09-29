package com.khatiyan.c_shared.rate_limit;

import java.time.Duration;
import java.time.Instant;

/**
 * The token-bucket arithmetic the database fallback runs, matching Bucket4j's.
 *
 * <p>Valkey's buckets are Bucket4j's {@code refillGreedy}: they hold
 * {@code capacity} tokens, start full, and refill CONTINUOUSLY at
 * {@code capacity / duration} tokens a second rather than all at once at the
 * end of a window. The fallback has to be the same shape, not merely the same
 * numbers. A fixed-window counter with the same attempts and duration lets
 * twice the limit through across a window boundary — the tail of one window
 * and the head of the next — which is exactly the moment an attacker aims for.
 *
 * <p>Pure, so it can be checked against Bucket4j directly.
 */
final class TokenBucket {

    private TokenBucket() {
    }

    /**
     * Tries to take one token.
     *
     * @param storedTokens what the bucket held when last written
     * @param refilledAt when that was
     * @return the decision, and what the bucket holds afterwards
     */
    static Take take(double storedTokens, Instant refilledAt, Instant now, int capacity, int durationSeconds) {
        double perSecond = (double) capacity / durationSeconds;
        double elapsedSeconds = Math.max(0, Duration.between(refilledAt, now).toNanos()) / 1_000_000_000d;
        double available = Math.min(capacity, storedTokens + elapsedSeconds * perSecond);

        // Bucket4j counts in whole nanoseconds, exactly; this counts in doubles.
        // Without a tolerance a bucket refilled to 0.9999999999 would refuse a
        // request Bucket4j lets through, and the two stores would disagree at
        // precisely the moment a bucket comes back from empty.
        if (available >= 1 - EPSILON) {
            double left = Math.max(0, available - 1);
            return new Take(true, left, (long) Math.floor(left + EPSILON), 0);
        }

        // Rounded as the Valkey path rounds Bucket4j's wait — down to whole
        // seconds, never below one — so both stores quote the same number.
        long retryAfter = Math.max(1, (long) Math.floor((1 - available) / perSecond));
        return new Take(false, available, 0, retryAfter);
    }

    private static final double EPSILON = 1e-9;

    /** A new bucket is full, as Bucket4j's are. */
    static double full(int capacity) {
        return capacity;
    }

    record Take(boolean allowed, double tokensAfter, long remainingTokens, long retryAfterSeconds) {

        RateLimitResult toResult() {
            return allowed ? RateLimitResult.allowed(remainingTokens) : RateLimitResult.rejected(retryAfterSeconds);
        }
    }
}
