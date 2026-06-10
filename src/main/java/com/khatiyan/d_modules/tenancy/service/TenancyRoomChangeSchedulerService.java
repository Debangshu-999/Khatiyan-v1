package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Executes approved room changes before billing cycle generation.
 */
@Slf4j
@Component
public class TenancyRoomChangeSchedulerService {

    private final TenancyRoomChangeRequestService roomChangeRequestService;
    private final int batchSize;

    public TenancyRoomChangeSchedulerService(
            TenancyRoomChangeRequestService roomChangeRequestService,
            @Value("${app.tenancy.room-change-execution-batch-size:50}") int batchSize) {
        this.roomChangeRequestService = roomChangeRequestService;
        this.batchSize = batchSize;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void executeDueRoomChangesOnStartup() {
        log.info("Tenancy room change scheduler startup catch-up started");
        executeDueRoomChanges();
    }

    @Scheduled(
            cron = "${app.tenancy.room-change-execution-cron:0 12 0 * * *}",
            zone = "${app.tenancy.room-change-execution-zone:Asia/Kolkata}")
    public void executeDueRoomChanges() {
        LocalDate today = LocalDate.now();
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
}
