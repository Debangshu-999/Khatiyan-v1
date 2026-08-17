package com.khatiyan.d_modules.staff.service;

import java.time.LocalDate;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Closes employments whose scheduled last working day has arrived.
 *
 * <p>An owner who removes someone can either end it now or name a future last
 * day. The second only writes the date down — the person keeps working, keeps
 * their access and keeps earning — and this sweep is what finally ends it.
 *
 * <p>Runs daily at 00:45 IST, after the salary month roll-over at 00:30, so a
 * worker whose last day is the 1st still gets that month opened before they are
 * closed out. It also runs on startup, because a scheduled end that came due
 * while the server was down is still due.
 *
 * <p>Uses {@code <=} rather than {@code ==} today for the same reason: a missed
 * run must not strand someone as permanently active. The stored end date is
 * kept as-is, so the record still shows the day they actually left.
 */
@Slf4j
@Component
public class ScheduledEmploymentEndSchedulerService {

    private final StaffService staffService;

    public ScheduledEmploymentEndSchedulerService(StaffService staffService) {
        this.staffService = staffService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "employmentEnd-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void runScheduledEndCatchUpOnStartup() {
        log.info("Scheduled employment end catch-up started");
        endDueScheduledEmployments();
    }

    @Scheduled(
            cron = "${app.staff.scheduled-end-cron:0 45 0 * * *}",
            zone = "${app.staff.scheduled-end-zone:Asia/Kolkata}")
    @SchedulerLock(name = "employmentEnd-endDueScheduled", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void endDueScheduledEmployments() {
        LocalDate today = LocalDate.now();
        int endedCount = staffService.endDueScheduledEmployments(today);

        if (endedCount == 0) {
            log.info("Scheduled employment end sweep found nothing due today={}", today);
            return;
        }

        log.info("Scheduled employment end sweep completed endedCount={} today={}", endedCount, today);
    }
}
