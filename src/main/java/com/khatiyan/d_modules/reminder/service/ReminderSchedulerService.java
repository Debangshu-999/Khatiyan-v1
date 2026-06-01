package com.khatiyan.d_modules.reminder.service;

import java.time.LocalDate;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class ReminderSchedulerService {

    private final BillingReminderScannerService billingReminderScannerService;
    private final TenancyReminderScannerService tenancyReminderScannerService;
    private final ConcernReminderScannerService concernReminderScannerService;
    private final ReminderService reminderService;

    public ReminderSchedulerService(
            BillingReminderScannerService billingReminderScannerService,
            TenancyReminderScannerService tenancyReminderScannerService,
            ConcernReminderScannerService concernReminderScannerService,
            ReminderService reminderService) {
        this.billingReminderScannerService = billingReminderScannerService;
        this.tenancyReminderScannerService = tenancyReminderScannerService;
        this.concernReminderScannerService = concernReminderScannerService;
        this.reminderService = reminderService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void scanAndProcessOnStartup() {
        log.info("Reminder scheduler startup catch-up started");
        scanAndCreateDueReminders();
        processDueReminders();
    }

    @Scheduled(
            cron = "${app.reminder.scan-cron:0 40 0 * * *}",
            zone = "${app.reminder.scan-zone:Asia/Kolkata}")
    public void scanAndCreateDueRemindersOnSchedule() {
        scanAndCreateDueReminders();
    }

    public int scanAndCreateDueReminders() {
        LocalDate today = LocalDate.now();

        int billingCount = billingReminderScannerService.scan(today);
        int tenancyCount = tenancyReminderScannerService.scan(today);
        int concernCount = concernReminderScannerService.scan(today);
        int totalCount = billingCount + tenancyCount + concernCount;

        log.info(
                "Reminder scan completed today={} billing={} tenancy={} concern={} total={}",
                today,
                billingCount,
                tenancyCount,
                concernCount,
                totalCount);

        return totalCount;
    }

    @Scheduled(
            cron = "${app.reminder.process-cron:0 */5 * * * *}",
            zone = "${app.reminder.process-zone:Asia/Kolkata}")
    public void processDueRemindersOnSchedule() {
        processDueReminders();
    }

    public int processDueReminders() {
        return reminderService.processDueReminders();
    }
}
