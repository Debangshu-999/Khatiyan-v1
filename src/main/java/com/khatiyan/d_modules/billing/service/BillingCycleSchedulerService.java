package com.khatiyan.d_modules.billing.service;

import java.time.LocalDate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the billing module.
 *
 * <p>
 * Monthly cycle generation is intentionally separate from tenancy creation.
 * Tenancy creation opens the first cycle immediately; this scheduler advances
 * existing active monthly tenancies when their next billing period arrives.
 */
@Slf4j
@Component
public class BillingCycleSchedulerService {

    private final BillingCycleService billingCycleService;
    private final int monthlyCycleBatchSize;

    public BillingCycleSchedulerService(
            BillingCycleService billingCycleService,
            @Value("${app.billing.monthly-cycle-generation-batch-size:50}") int monthlyCycleBatchSize) {
        this.billingCycleService = billingCycleService;
        this.monthlyCycleBatchSize = monthlyCycleBatchSize;
    }

    /**
     * Creates the next monthly billing cycle for due active monthly tenancies.
     */
    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "billing-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void runBillingCatchUpOnStartup() {
        log.info("Billing scheduler startup catch-up started");
        generateDueMonthlyCycles();
        activateDueCycles();
        markPastDueCycles();
        recalculateLateFees();
        generateClosedMonthlyReports();
    }

    /**
     * Creates the next monthly billing cycle for due active monthly tenancies.
     */
    @Scheduled(
            cron = "${app.billing.monthly-cycle-generation-cron:0 15 0 * * *}",
            zone = "${app.billing.monthly-cycle-generation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "billing-generateDueMonthlyCycles", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void generateDueMonthlyCycles() {
        LocalDate today = LocalDate.now();
        int generatedCount = billingCycleService.generateDueMonthlyCycles(today, monthlyCycleBatchSize);

        if (generatedCount == 0) {
            log.info("Monthly billing scheduler found no due cycles today={}", today);
            return;
        }

        log.info("Monthly billing scheduler generated cycles count={} today={}", generatedCount, today);
    }

    /**
     * Opens the payment window for cycles whose start date has arrived, freezing
     * them. Runs before the overdue marker so a cycle activating today can be
     * assessed in the same pass.
     */
    @Scheduled(
            cron = "${app.billing.cycle-activation-cron:0 18 0 * * *}",
            zone = "${app.billing.cycle-activation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "billing-activateDueCycles", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void activateDueCycles() {
        LocalDate today = LocalDate.now();
        int activatedCount = billingCycleService.activateDueCycles(today);

        if (activatedCount == 0) {
            log.info("Billing activation scheduler found no cycles to activate today={}", today);
            return;
        }

        log.info("Billing activation scheduler activated cycles count={} today={}", activatedCount, today);
    }

    /**
     * Moves unpaid cycles into overdue status after their rent due date.
     */
    @Scheduled(
            cron = "${app.billing.overdue-marker-cron:0 20 0 * * *}",
            zone = "${app.billing.overdue-marker-zone:Asia/Kolkata}")
    @SchedulerLock(name = "billing-markPastDueCycles", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void markPastDueCycles() {
        LocalDate today = LocalDate.now();
        int updatedCount = billingCycleService.markPastDueCycles(today);

        if (updatedCount == 0) {
            log.info("Billing overdue scheduler found no past-due cycles today={}", today);
            return;
        }

        log.info("Billing overdue scheduler marked cycles count={} today={}", updatedCount, today);
    }

    /**
     * Creates or refreshes visible late-fee line items for overdue cycles.
     */
    @Scheduled(
            cron = "${app.billing.late-fee-recalculation-cron:0 25 0 * * *}",
            zone = "${app.billing.late-fee-recalculation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "billing-recalculateLateFees", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void recalculateLateFees() {
        LocalDate today = LocalDate.now();
        int updatedCount = billingCycleService.recalculateLateFees(today);

        if (updatedCount == 0) {
            log.info("Billing late-fee scheduler found no late-fee updates today={}", today);
            return;
        }

        log.info("Billing late-fee scheduler updated cycles count={} today={}", updatedCount, today);
    }

    /**
     * Generates finalized monthly CSV reports after a month has closed.
     */
    @Scheduled(
            cron = "${app.billing.monthly-report-generation-cron:0 44 0 * * *}",
            zone = "${app.billing.monthly-report-generation-zone:Asia/Kolkata}")
    @SchedulerLock(name = "billing-generateClosedMonthlyReports", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void generateClosedMonthlyReports() {
        LocalDate today = LocalDate.now();
        int generatedCount = billingCycleService.generateClosedMonthlyReports(today);

        if (generatedCount == 0) {
            log.info("Billing monthly-report scheduler found no reports to generate today={}", today);
            return;
        }

        log.info("Billing monthly-report scheduler generated reports count={} today={}", generatedCount, today);
    }
}
