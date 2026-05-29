package com.khatiyan.c_shared.rate_limit;

/**
 * Result of consuming one token from a rate-limit bucket.
 */
public record RateLimitResult(
        boolean allowed,
        long remainingTokens,
        long retryAfterSeconds) {

    public static RateLimitResult allowed(long remainingTokens) {
        return new RateLimitResult(true, remainingTokens, 0);
    }

    public static RateLimitResult rejected(long retryAfterSeconds) {
        return new RateLimitResult(false, 0, retryAfterSeconds);
    }
}
