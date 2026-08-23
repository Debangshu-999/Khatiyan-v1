package com.khatiyan.d_modules.billing.service;

import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Scheduled jobs owned by the billing module. Every job runs once a day, in the
 * small hours IST: generate 00:15, activate 00:18, mark overdue 00:20, late fees
 * 00:25, monthly reports 00:44.
 *
 * <p>Monthly cycle generation is intentionally separate from tenancy creation.
 * Creating a tenancy makes its FIRST cycle and, when that cycle's period has
 * already started, opens it there and then. This scheduler exists for the two
 * cases creation cannot cover: advancing active monthly tenancies when their
 * next period arrives, and opening cycles that were dated into the future.
 *
 * <p>An earlier version of this comment claimed creation opened the first cycle
 * immediately when it did not — the cycle was saved UPCOMING and sat unpayable
 * until 00:18 the next morning. The claim is true now; it was not then, and it
 * cost a debugging session to find out.
 */
@Slf4j
@Component
public class BillingCycleSchedulerService {

    private final BillingCycleService billingCycleService;
    private final int monthlyCycleBatchSize;

    /**
     * Each job's "today", in the zone that job's cron actually fires in.
     *
     * <p>These used to be plain {@code LocalDate.now()} — the SERVER's default
     * zone — while every cron above is pinned to Asia/Kolkata. On an IST host the
     * two agree and nothing shows; on a UTC host the 00:18 IST run computes
     * yesterday's date and silently skips every cycle starting that day. Reading
     * the same property the cron uses is what keeps them from drifting apart.
     */
    private final ZoneId generationZone;
    private final ZoneId activationZone;
    private final ZoneId overdueZone;
    private final ZoneId lateFeeZone;
    private final ZoneId reportZone;

    public BillingCycleSchedulerService(
            BillingCycleService billingCycleService,
            @Value("${app.billing.monthly-cycle-generation-batch-size:50}") int monthlyCycleBatchSize,
            @Value("${app.billing.monthly-cycle-generation-zone:Asia/Kolkata}") String generationZone,
            @Value("${app.billing.cycle-activation-zone:Asia/Kolkata}") String activationZone,
            @Value("${app.billing.overdue-marker-zone:Asia/Kolkata}") String overdueZone,
            @Value("${app.billing.late-fee-recalculation-zone:Asia/Kolkata}") String lateFeeZone,
            @Value("${app.billing.monthly-report-generation-zone:Asia/Kolkata}") String reportZone) {
        this.billingCycleService = billingCycleService;
        this.monthlyCycleBatchSize = monthlyCycleBatchSize;
        this.generationZone = ZoneId.of(generationZone);
        this.activationZone = ZoneId.of(activationZone);
        this.overdueZone = ZoneId.of(overdueZone);
        this.lateFeeZone = ZoneId.of(lateFeeZone);
        this.reportZone = ZoneId.of(reportZone);
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
        LocalDate today = LocalDate.now(generationZone);
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
        LocalDate today = LocalDate.now(activationZone);
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
        LocalDate today = LocalDate.now(overdueZone);
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
        LocalDate today = LocalDate.now(lateFeeZone);
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
        LocalDate today = LocalDate.now(reportZone);
        int generatedCount = billingCycleService.generateClosedMonthlyReports(today);

        if (generatedCount == 0) {
            log.info("Billing monthly-report scheduler found no reports to generate today={}", today);
            return;
        }

        log.info("Billing monthly-report scheduler generated reports count={} today={}", generatedCount, today);
    }
}
