package com.khatiyan.d_modules.notice.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the notice module.
 *
 * <p>The scheduler only coordinates periodic work. Notice publication,
 * recurring notice generation, and lifecycle rules stay inside the dedicated
 * services so controller flows and scheduled flows use the same business logic.
 */
@Slf4j
@Component
public class NoticeSchedulerService {

    private final NoticeService noticeService;
    private final RecurringNoticeService recurringNoticeService;

    public NoticeSchedulerService(
            NoticeService noticeService,
            RecurringNoticeService recurringNoticeService) {
        this.noticeService = noticeService;
        this.recurringNoticeService = recurringNoticeService;
    }

    /**
     * Prepares today's notices from active recurring templates.
     *
     * <p>The generated notices can be created early because tenant visibility
     * is still controlled by each notice's visibleFrom and visibleUntil window.
     * This runs frequently so templates created later in the day can still
     * generate today's notice without waiting until tomorrow.
     */
    @Scheduled(
            cron = "${app.notice.recurring-generation-cron:0 */5 * * * *}",
            zone = "${app.notice.recurring-generation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "notice-generateDueRecurringNotices", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void generateDueRecurringNotices() {
        int generatedCount = recurringNoticeService.generateDueRecurringNotices();

        if (generatedCount > 0) {
            log.info("Notice scheduler generated recurring notices count={}", generatedCount);
        } else {
            log.info("Notice scheduler found no recurring notices to generate");
        }
    }

    /**
     * Archives expired published notices for management history.
     */
    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "notice-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void archiveExpiredNoticesOnStartup() {
        log.info("Notice archive scheduler startup catch-up started");
        archiveExpiredNotices();
    }

    /**
     * Archives expired published notices for management history.
     */
    @Scheduled(
            cron = "${app.notice.archive-expired-cron:0 45 0 * * *}",
            zone = "${app.notice.archive-expired-zone:Asia/Kolkata}")
    @SchedulerLock(name = "notice-archiveExpiredNotices", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void archiveExpiredNotices() {
        int archivedCount = noticeService.archiveExpiredNotices();

        if (archivedCount > 0) {
            log.info("Notice scheduler archived expired notices count={}", archivedCount);
        } else {
            log.info("Notice scheduler found no expired notices to archive");
        }
    }
}
