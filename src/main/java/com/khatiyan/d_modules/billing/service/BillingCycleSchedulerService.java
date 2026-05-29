package com.khatiyan.d_modules.billing.service;

import java.time.LocalDate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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
    @Scheduled(
            cron = "${app.billing.monthly-cycle-generation-cron:0 10 0 * * *}",
            zone = "${app.billing.monthly-cycle-generation-zone:Asia/Kolkata}")
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
     * Moves unpaid cycles into overdue status after their rent due date.
     */
    @Scheduled(
            cron = "${app.billing.overdue-marker-cron:0 15 0 * * *}",
            zone = "${app.billing.overdue-marker-zone:Asia/Kolkata}")
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
            cron = "${app.billing.late-fee-recalculation-cron:0 20 0 * * *}",
            zone = "${app.billing.late-fee-recalculation-zone:Asia/Kolkata}")
    public void recalculateLateFees() {
        LocalDate today = LocalDate.now();
        int updatedCount = billingCycleService.recalculateLateFees(today);

        if (updatedCount == 0) {
            log.info("Billing late-fee scheduler found no late-fee updates today={}", today);
            return;
        }

        log.info("Billing late-fee scheduler updated cycles count={} today={}", updatedCount, today);
    }
}
