package com.khatiyan.d_modules.tenancy.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Executes approved room changes before billing cycle generation.
 */
@Slf4j
@Component
public class TenancyRoomChangeSchedulerService {

    private static final ZoneId SCHEDULER_ZONE = ZoneId.of("Asia/Kolkata");

    private final TenancyRoomChangeRequestService roomChangeRequestService;
    private final int batchSize;

    public TenancyRoomChangeSchedulerService(
            TenancyRoomChangeRequestService roomChangeRequestService,
            @Value("${app.tenancy.room-change-execution-batch-size:50}") int batchSize) {
        this.roomChangeRequestService = roomChangeRequestService;
        this.batchSize = batchSize;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "tenancy-roomChange-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void executeDueRoomChangesOnStartup() {
        log.info("Tenancy room change scheduler startup catch-up started");
        executeDueRoomChanges();
    }

    @Scheduled(
            cron = "${app.tenancy.room-change-execution-cron:0 12 0 * * *}",
            zone = "${app.tenancy.room-change-execution-zone:Asia/Kolkata}")
    @SchedulerLock(name = "tenancy-executeDueRoomChanges", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void executeDueRoomChanges() {
        // Property timezone, matching the cron's zone. LocalDate.now() reads
        // the JVM default, so on a UTC server this would ask for "yesterday"
        // and skip every transfer due today.
        LocalDate today = LocalDate.now(SCHEDULER_ZONE);
        List<UUID> requestIds = roomChangeRequestService.findDueApprovedRequestIds(today, batchSize);

        if (requestIds.isEmpty()) {
            log.info("Tenancy room change scheduler found no approved requests due today={}", today);
            return;
        }

        int executedCount = 0;
        int failedCount = 0;
        for (UUID requestId : requestIds) {
            try {
                roomChangeRequestService.executeDueApprovedRequest(requestId);
                executedCount = executedCount + 1;
            } catch (RuntimeException exception) {
                failedCount = failedCount + 1;
                log.error("Tenancy room change scheduler failed requestId={}", requestId, exception);
            }
        }

        log.info(
                "Tenancy room change scheduler completed due requests found={} executed={} failed={}",
                requestIds.size(),
                executedCount,
                failedCount);
    }

    /**
     * Expires room change requests nobody reviewed within the review window.
     *
     * <p>Touches only REQUESTED rows, so no reserved bed is released here — an
     * approved room change holds a bed and is closed deliberately, never by a
     * sweep.
     */
    @Scheduled(
            cron = "${app.tenancy.room-change-expiry-cron:0 22 0 * * *}",
            zone = "${app.tenancy.room-change-execution-zone:Asia/Kolkata}")
    @SchedulerLock(name = "tenancy-expireStaleRoomChanges", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void expireStaleRoomChangeRequests() {
        List<UUID> requestIds = roomChangeRequestService.findStaleRequestIds(Instant.now(), batchSize);

        if (requestIds.isEmpty()) {
            log.info("Tenancy room change scheduler found no unreviewed requests to expire");
            return;
        }

        int expiredCount = 0;
        int failedCount = 0;
        for (UUID requestId : requestIds) {
            try {
                roomChangeRequestService.expireStaleRequest(requestId);
                expiredCount = expiredCount + 1;
            } catch (RuntimeException exception) {
                failedCount = failedCount + 1;
                log.error("Tenancy room change expiry failed requestId={}", requestId, exception);
            }
        }

        log.info(
                "Tenancy room change expiry completed found={} expired={} failed={}",
                requestIds.size(),
                expiredCount,
                failedCount);
    }
}
