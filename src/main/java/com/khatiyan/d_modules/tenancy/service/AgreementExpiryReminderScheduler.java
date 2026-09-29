package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Runs {@link AgreementExpiryReminderService} nightly and once on every startup.
 * A separate bean so each run goes through the service's transactional proxy:
 * the reminder events are delivered by transactional listeners, which a call
 * from inside the same bean would never reach.
 */
@Component
public class AgreementExpiryReminderScheduler {

    private static final ZoneId REMINDER_ZONE = ZoneId.of("Asia/Kolkata");

    private final AgreementExpiryReminderService reminderService;

    public AgreementExpiryReminderScheduler(AgreementExpiryReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "tenancy-agreementExpiryReminders-startupCatchUp", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sendDueOnStartup() {
        reminderService.sendDue(LocalDate.now(REMINDER_ZONE));
    }

    /** Runs before the exit and billing jobs, so a tenant's morning notifications line up. */
    @Scheduled(
            cron = "${app.tenancy.agreement-expiry-reminder-cron:0 5 0 * * *}",
            zone = "${app.tenancy.agreement-expiry-reminder-zone:Asia/Kolkata}")
    @SchedulerLock(name = "tenancy-agreementExpiryReminders", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sendDueNightly() {
        reminderService.sendDue(LocalDate.now(REMINDER_ZONE));
    }
}
