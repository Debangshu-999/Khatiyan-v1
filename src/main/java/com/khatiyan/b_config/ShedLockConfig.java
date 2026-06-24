package com.khatiyan.b_config;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;

/**
 * Enables ShedLock so every {@code @Scheduled} job annotated with
 * {@code @SchedulerLock} runs on only one application instance at a time.
 *
 * <p>This is the fleet-wide duplicate-prevention layer: as we scale from one to
 * two (and later more) instances, the coarse "scan-and-mutate" jobs would
 * otherwise double-fire. The lock is keyed by job name in the
 * {@code public.shedlock} table (see migration {@code V6034}).
 *
 * <p>{@code defaultLockAtMostFor} is the safety valve: if an instance dies while
 * holding a lock, the lock auto-expires after this long so another instance can
 * resume. It is generous on purpose — duplicate prevention is favoured over fast
 * recovery — and the per-job idempotency / unique constraints remain the real
 * data-integrity guarantee if a lock ever expires mid-run.
 *
 * <p>{@code usingDbTime()} makes ShedLock compare timestamps using the database
 * clock instead of each node's clock, so lock timing is immune to host clock
 * skew across instances.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(new JdbcTemplate(dataSource))
                        .withTableName("public.shedlock")
                        .usingDbTime()
                        .build());
    }
}
