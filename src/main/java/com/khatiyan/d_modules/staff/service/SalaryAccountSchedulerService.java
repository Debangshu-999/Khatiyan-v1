package com.khatiyan.d_modules.staff.service;

import java.time.LocalDate;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the staff module.
 *
 * <p>
 * Monthly salary accounts roll over automatically. This scheduler runs once a
 * day (and on startup) and opens the current payroll month for every active
 * monthly salary account that does not have it yet. Running daily — rather than
 * only on the 1st — means it both opens the new month at the start of each month
 * and picks up accounts opened mid-month (e.g. a manager or staff member who
 * joined after the 1st), without waiting for the next month. The work is
 * idempotent, so repeated daily runs are no-ops once the month exists. Daily-wage
 * employees have no salary account, so nothing is opened for them.
 */
@Slf4j
@Component
public class SalaryAccountSchedulerService {

    private final SalaryAccountService salaryAccountService;

    public SalaryAccountSchedulerService(SalaryAccountService salaryAccountService) {
        this.salaryAccountService = salaryAccountService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "salary-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void runSalaryMonthCatchUpOnStartup() {
        log.info("Salary month scheduler startup catch-up started");
        openDueSalaryMonths();
    }

    /**
     * Opens the current payroll month for active monthly salary accounts. Runs
     * daily at 00:30 IST so it both rolls over on the 1st and picks up accounts
     * opened mid-month; idempotent once a month has been opened.
     */
    @Scheduled(
            cron = "${app.salary.month-open-cron:0 30 0 * * *}",
            zone = "${app.salary.month-open-zone:Asia/Kolkata}")
    @SchedulerLock(name = "salary-openDueSalaryMonths", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void openDueSalaryMonths() {
        LocalDate today = LocalDate.now();
        int openedCount = salaryAccountService.openDueSalaryMonths(today);

        if (openedCount == 0) {
            log.info("Salary month scheduler found no months to open today={}", today);
            return;
        }

        log.info("Salary month scheduler opened months count={} today={}", openedCount, today);
    }
}
