package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the tenancy module.
 *
 * <p>
 * The scheduler only finds due approved exit requests and delegates execution
 * to {@link TenancyExitRequestService}. Manual execution and scheduled
 * execution therefore pass through the same billing and tenancy lifecycle
 * checks.
 */
@Slf4j
@Component
public class TenancyExitSchedulerService {

    private final TenancyExitRequestService tenancyExitRequestService;
    private final int batchSize;

    public TenancyExitSchedulerService(
            TenancyExitRequestService tenancyExitRequestService,
            @Value("${app.tenancy.exit-execution-batch-size:50}") int batchSize) {
        this.tenancyExitRequestService = tenancyExitRequestService;
        this.batchSize = batchSize;
    }

    /**
     * Executes approved tenancy exit requests whose checkout date has arrived.
     */
    @Scheduled(
            cron = "${app.tenancy.exit-execution-cron:0 5 0 * * *}",
            zone = "${app.tenancy.exit-execution-zone:Asia/Kolkata}")
    public void executeDueExitRequests() {
        LocalDate today = LocalDate.now();
        List<UUID> requestIds = tenancyExitRequestService.findDueApprovedRequestIds(today, batchSize);

        if (requestIds.isEmpty()) {
            log.info("Tenancy exit scheduler found no approved exit requests due today={}", today);
            return;
        }

        int executedCount = 0;
        int failedCount = 0;
        for (UUID requestId : requestIds) {
            try {
                tenancyExitRequestService.executeDueApprovedRequest(requestId);
                executedCount = executedCount + 1;
            } catch (RuntimeException exception) {
                failedCount = failedCount + 1;
                log.error("Tenancy exit scheduler failed requestId={}", requestId, exception);
            }
        }

        log.info(
                "Tenancy exit scheduler completed due requests found={} executed={} failed={}",
                requestIds.size(),
                executedCount,
                failedCount);
    }
}
