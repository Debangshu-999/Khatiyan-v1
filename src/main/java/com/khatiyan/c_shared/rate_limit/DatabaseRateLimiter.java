package com.khatiyan.c_shared.rate_limit;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * The same buckets as Valkey's, kept in Postgres, for when Valkey is down.
 *
 * <p>Only ever asked when Valkey could not be — see {@link RateLimitService}.
 * Before this existed the API-wide and per-route limits simply switched off in
 * a Valkey outage (the filter failed open), while OTP sending had a database
 * fallback of its own. Now every limit in the app has one.
 *
 * <p><b>Its own transaction.</b> A limit is spent whether or not the request
 * that spent it goes on to succeed. Joining the caller's transaction would let
 * a failing request roll its own attempt back and try again for free — the
 * precise loophole a limit exists to close.
 *
 * <p><b>A row lock per bucket.</b> Two requests reading the same bucket at once
 * could otherwise both see the last token and both take it.
 */
@Slf4j
@Component
public class DatabaseRateLimiter {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate ownTransaction;

    public DatabaseRateLimiter(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.ownTransaction = new TransactionTemplate(transactionManager);
        this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public RateLimitResult consume(String key, int attempts, int durationSeconds) {
        return ownTransaction.execute(status -> {
            Instant now = Instant.now();
            // Idle for a whole duration, a bucket is full again — so the row
            // says nothing a fresh one would not, and can be swept.
            Timestamp expiresAt = Timestamp.from(now.plus(Duration.ofSeconds(durationSeconds)));

            jdbc.update("""
                    INSERT INTO public.rate_limit_buckets (bucket_key, tokens, refilled_at, expires_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (bucket_key) DO NOTHING
                    """,
                    key, TokenBucket.full(attempts), Timestamp.from(now), expiresAt);

            TokenBucket.Take take = jdbc.queryForObject("""
                    SELECT tokens, refilled_at
                    FROM public.rate_limit_buckets
                    WHERE bucket_key = ?
                    FOR UPDATE
                    """,
                    (row, index) -> TokenBucket.take(
                            row.getDouble("tokens"),
                            row.getTimestamp("refilled_at").toInstant(),
                            now,
                            attempts,
                            durationSeconds),
                    key);

            jdbc.update("""
                    UPDATE public.rate_limit_buckets
                    SET tokens = ?, refilled_at = ?, expires_at = ?
                    WHERE bucket_key = ?
                    """,
                    take.tokensAfter(), Timestamp.from(now), expiresAt, key);

            return take.toResult();
        });
    }

    /**
     * Sweeps buckets idle for longer than their own duration.
     *
     * <p>Rows only accumulate during a Valkey outage, so there is rarely
     * anything here. Swept anyway, because an outage long enough to matter is
     * also long enough to leave one row behind for every IP that visited.
     */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT10M")
    @SchedulerLock(name = "rateLimit-sweepExpiredBuckets", lockAtMostFor = "PT10M", lockAtLeastFor = "PT30S")
    public void sweepExpiredBuckets() {
        int swept = jdbc.update("DELETE FROM public.rate_limit_buckets WHERE expires_at < now()");
        if (swept > 0) {
            log.info("Swept expired database rate-limit buckets count={}", swept);
        }
    }
}
