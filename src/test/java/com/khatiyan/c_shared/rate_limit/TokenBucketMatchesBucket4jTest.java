package com.khatiyan.c_shared.rate_limit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Duration;
import java.time.Instant;
import java.util.Random;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.TimeMeter;

/**
 * The database fallback decides exactly as Valkey's Bucket4j buckets do.
 *
 * <p>"The same configuration" is only a promise if the two stores answer the
 * same request the same way. So this runs both side by side on one simulated
 * clock — a real Bucket4j bucket built from the very configuration the Valkey
 * path uses, and the fallback's arithmetic — through thousands of requests in
 * bursts and pauses, and requires the same decision at every step.
 *
 * <p>Each row is a limit the app actually configures.
 */
class TokenBucketMatchesBucket4jTest {

    /** A clock that moves only when told to. */
    private static final class SimulatedClock implements TimeMeter {
        private long nanos;

        @Override
        public long currentTimeNanos() {
            return nanos;
        }

        @Override
        public boolean isWallClockBased() {
            return false;
        }
    }

    @ParameterizedTest(name = "{0} per {1}s")
    @CsvSource({
        "300, 60",     // the API-wide limit per IP
        "100, 900",    // login attempts per IP
        "30, 3600",    // OTP routes per IP
        "30, 600",     // payments per user
        "20, 86400",   // concerns per user
        "20, 3600",    // push-token registrations
        "5, 900",      // sign-ups per number
        "3, 900",      // email codes per address
    })
    void theFallbackDecidesExactlyAsBucket4jDoes(int attempts, int durationSeconds) {
        SimulatedClock clock = new SimulatedClock();
        Bucket reference = Bucket.builder()
                .addLimit(RateLimitService.configuration(attempts, durationSeconds).getBandwidths()[0])
                .withCustomTimePrecision(clock)
                .build();

        Instant epoch = Instant.parse("2026-09-26T00:00:00Z");
        double tokens = TokenBucket.full(attempts);
        Instant refilledAt = epoch;

        long nanosPerToken = durationSeconds * 1_000_000_000L / attempts;
        Random random = new Random(attempts * 31L + durationSeconds);

        for (int step = 0; step < 2_000; step++) {
            // Mostly bursts faster than the refill, sometimes a long pause —
            // the pattern that walks a bucket to empty and back again.
            long gap = random.nextInt(10) < 8
                    ? random.nextLong(0, Math.max(1, nanosPerToken / 2))
                    : random.nextLong(nanosPerToken, nanosPerToken * Math.max(2, attempts));
            clock.nanos += gap;
            Instant now = epoch.plusNanos(clock.nanos);

            ConsumptionProbe expected = reference.tryConsumeAndReturnRemaining(1);
            TokenBucket.Take actual = TokenBucket.take(tokens, refilledAt, now, attempts, durationSeconds);
            tokens = actual.tokensAfter();
            refilledAt = now;

            assertThat(actual.allowed()).as("step %d: allowed", step).isEqualTo(expected.isConsumed());
            if (expected.isConsumed()) {
                assertThat(actual.remainingTokens())
                        .as("step %d: tokens left", step)
                        .isEqualTo(expected.getRemainingTokens());
            } else {
                long expectedWait = Math.max(1, Duration.ofNanos(expected.getNanosToWaitForRefill()).toSeconds());
                assertThat(actual.retryAfterSeconds())
                        .as("step %d: seconds to wait", step)
                        .isCloseTo(expectedWait, within(1L));
            }
        }
    }
}
