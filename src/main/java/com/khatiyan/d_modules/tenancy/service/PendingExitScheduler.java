package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Runs {@link PendingExitService} nightly and once on every startup, so a night
 * the server was down is caught the moment it comes back. Each stay is flipped
 * in its own transaction: one bad row cannot stop the rest.
 */
@Slf4j
@Component
public class PendingExitScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final PendingExitService pendingExitService;

    public PendingExitScheduler(PendingExitService pendingExitService) {
        this.pendingExitService = pendingExitService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "tenancy-markPendingExit-startupCatchUp", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void markDueOnStartup() {
        markDue(LocalDate.now(IST));
    }

    @Scheduled(
            cron = "${app.tenancy.pending-exit-cron:0 2 0 * * *}",
            zone = "${app.tenancy.pending-exit-zone:Asia/Kolkata}")
    @SchedulerLock(name = "tenancy-markPendingExit", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void markDueNightly() {
        markDue(LocalDate.now(IST));
    }

    /** Returns how many stays became pending exit. */
    public int markDue(LocalDate today) {
        List<UUID> due = pendingExitService.findDue(today);
        int marked = 0;
        int failed = 0;
        for (UUID tenancyId : due) {
            try {
                if (pendingExitService.markPendingExit(tenancyId, today)) {
                    marked = marked + 1;
                }
            } catch (RuntimeException exception) {
                failed = failed + 1;
                log.error("Pending exit failed tenancyId={}", tenancyId, exception);
            }
        }
        log.info("Pending exit sweep today={} found={} marked={} failed={}", today, due.size(), marked, failed);
        return marked;
    }
}
