package com.khatiyan.d_modules.compliance.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

/**
 * When an unsigned agreement actually expires.
 *
 * <p>Not "created plus the window": signing never checks the window, and
 * {@link AgreementExpiryScheduler} only removes agreements when it runs (00:30
 * IST by default). So the real deadline is its first run after the window has
 * passed, and that is what the owner is shown. Read from the same properties
 * as the scheduler, so the two cannot drift apart.
 */
@Component
public class AgreementAcceptanceWindow {

    private final int ttlDays;
    private final CronExpression expiryRun;
    private final ZoneId zone;

    public AgreementAcceptanceWindow(
            @Value("${app.compliance.agreement-acceptance-ttl-days:3}") int ttlDays,
            @Value("${app.compliance.agreement-expiry-cron:0 30 0 * * *}") String cron,
            @Value("${app.compliance.agreement-expiry-zone:Asia/Kolkata}") String zone) {
        this.ttlDays = ttlDays;
        this.expiryRun = CronExpression.parse(cron);
        this.zone = ZoneId.of(zone);
    }

    /** The moment the expiry run removes an agreement created at this instant. */
    public Instant expiresAt(Instant createdAt) {
        ZonedDateTime eligible = createdAt.plus(ttlDays, ChronoUnit.DAYS).atZone(zone);
        ZonedDateTime run = expiryRun.next(eligible);
        return run == null ? eligible.toInstant() : run.toInstant();
    }
}
