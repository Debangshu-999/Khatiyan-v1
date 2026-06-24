package com.khatiyan.d_modules.concerns.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

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
    @SchedulerLock(name = "concern-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void closeExpiredResolvedConcernsOnStartup() {
        log.info("Concern scheduler startup catch-up started");
        updateConcernEscalationLevels();
        closeExpiredResolvedConcerns();
    }

    /**
     * Closes resolved concerns after their tenant reopen window has expired.
     */
    @Scheduled(
            cron = "${app.concern.close-expired-resolved-cron:0 35 0 * * *}",
            zone = "${app.concern.close-expired-resolved-zone:Asia/Kolkata}")
    @SchedulerLock(name = "concern-closeExpiredResolvedConcerns", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void closeExpiredResolvedConcerns() {
        int closedCount = concernService.closeExpiredResolvedConcerns();

        if (closedCount > 0) {
            log.info("Concern scheduler closed expired resolved concerns count={}", closedCount);
        } else {
            log.info("Concern scheduler found no expired resolved concerns to close");
        }
    }

    /**
     * Updates escalation levels for old open/under-review concerns.
     */
    @Scheduled(
            cron = "${app.concern.update-escalations-cron:0 30 0 * * *}",
            zone = "${app.concern.update-escalations-zone:Asia/Kolkata}")
    @SchedulerLock(name = "concern-updateConcernEscalationLevels", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void updateConcernEscalationLevels() {
        int updatedCount = concernService.updateConcernEscalationLevels();

        if (updatedCount > 0) {
            log.info("Concern scheduler updated escalation levels count={}", updatedCount);
        } else {
            log.info("Concern scheduler found no concern escalation levels to update");
        }
    }
}
