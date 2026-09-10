package com.khatiyan.d_modules.tenancy.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/** Runs configured tenancy exits and catches up on application startup. */
@Slf4j
@Component
public class ScheduledTenancyExitSchedulerService {

    private final ScheduledTenancyExitService scheduledExitService;
    private final int batchSize;

    public ScheduledTenancyExitSchedulerService(
            ScheduledTenancyExitService scheduledExitService,
            @Value("${app.tenancy.exit-execution-batch-size:50}") int batchSize) {
        this.scheduledExitService = scheduledExitService;
        this.batchSize = batchSize;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(
            name = "tenancy-scheduledExit-startupCatchUp",
            lockAtMostFor = "PT15M",
            lockAtLeastFor = "PT5S")
    public void executeDueExitsOnStartup() {
        log.info("Scheduled tenancy exit startup catch-up started");
        executeDueExits();
    }

    @Scheduled(
            cron = "${app.tenancy.exit-execution-cron:0 * * * * *}",
            zone = "${app.tenancy.exit-execution-zone:Asia/Kolkata}")
    @SchedulerLock(
            name = "tenancy-executeDueScheduledExits",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT5S")
    public void executeDueExits() {
        List<UUID> scheduleIds = scheduledExitService.findDueIds(Instant.now(), batchSize);
        if (scheduleIds.isEmpty()) {
            return;
        }

        int executed = 0;
        int deferred = 0;
        int skipped = 0;
        int failed = 0;
        for (UUID scheduleId : scheduleIds) {
            try {
                ScheduledTenancyExitService.ExecutionResult result =
                        scheduledExitService.executeDue(scheduleId);
                switch (result) {
                    case EXECUTED -> executed++;
                    case DEFERRED -> deferred++;
                    case SKIPPED -> skipped++;
                }
            } catch (RuntimeException exception) {
                failed++;
                log.error("Scheduled tenancy exit failed scheduleId={}", scheduleId, exception);
                try {
                    scheduledExitService.recordFailure(scheduleId, exception);
                } catch (RuntimeException recordException) {
                    log.error("Could not record scheduled tenancy exit failure scheduleId={}",
                            scheduleId, recordException);
                }
            }
        }

        log.info(
                "Scheduled tenancy exits completed found={} executed={} deferred={} skipped={} failed={}",
                scheduleIds.size(), executed, deferred, skipped, failed);
    }
}
