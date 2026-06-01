package com.khatiyan.d_modules.concerns.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the concern module.
 *
 * <p>The scheduler only triggers lifecycle maintenance. Concern state changes
 * stay inside {@link ConcernService}, so scheduled and manual flows share the
 * same rules.
 */
@Slf4j
@Component
public class ConcernSchedulerService {

    private final ConcernService concernService;

    public ConcernSchedulerService(ConcernService concernService) {
        this.concernService = concernService;
    }

    /**
     * Closes resolved concerns after their tenant reopen window has expired.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void closeExpiredResolvedConcernsOnStartup() {
        log.info("Concern scheduler startup catch-up started");
        closeExpiredResolvedConcerns();
    }

    /**
     * Closes resolved concerns after their tenant reopen window has expired.
     */
    @Scheduled(
            cron = "${app.concern.close-expired-resolved-cron:0 30 2 * * *}",
            zone = "${app.concern.close-expired-resolved-zone:Asia/Kolkata}")
    public void closeExpiredResolvedConcerns() {
        int closedCount = concernService.closeExpiredResolvedConcerns();

        if (closedCount > 0) {
            log.info("Concern scheduler closed expired resolved concerns count={}", closedCount);
        } else {
            log.info("Concern scheduler found no expired resolved concerns to close");
        }
    }
}
