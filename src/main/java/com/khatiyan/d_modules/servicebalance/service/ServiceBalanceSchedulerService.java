package com.khatiyan.d_modules.servicebalance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Keeps the ledger honest without anybody asking it to.
 *
 * <p>An owner's money must not depend on them reopening a screen. The balance
 * read reconciles what that owner is waiting for, but somebody who pays and then
 * closes the app would otherwise sit with an authorised payment and no balance
 * until they came back.
 */
@Service
public class ServiceBalanceSchedulerService {

    private static final Logger log = LoggerFactory.getLogger(ServiceBalanceSchedulerService.class);

    private final ServiceBalanceTopUpService topUpService;
    private final ServiceBalanceRefundService refundService;

    public ServiceBalanceSchedulerService(
            ServiceBalanceTopUpService topUpService, ServiceBalanceRefundService refundService) {
        this.topUpService = topUpService;
        this.refundService = refundService;
    }

    /**
     * Sends refunds that were written down but never left.
     *
     * <p>The money is already off the owner's balance at that point, so a
     * refund stuck here is the worst of both worlds until this runs.
     */
    @Scheduled(
            cron = "${app.service-balance.refund-cron:0 */5 * * * *}",
            zone = "${app.service-balance.refund-zone:Asia/Kolkata}")
    @SchedulerLock(
            name = "serviceBalance-sendPendingRefunds",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT15S")
    public void sendPendingRefunds() {
        int pending = refundService.sendPending();

        if (pending > 0) {
            log.info("Service balance sent refunds that were still waiting count={}", pending);
        }
    }

    /**
     * Asks the gateway about every checkout that has not finished.
     *
     * <p>The webhook is still the fast path. This is what turns a webhook that
     * is late, dropped, or blocked by a developer machine's network into a
     * delay rather than a loss.
     *
     * <p>Runs often, because the gateway returns an uncaptured authorisation
     * after three days and a capture we never make is money the owner paid and
     * did not receive.
     */
    @Scheduled(
            cron = "${app.service-balance.reconcile-cron:0 */5 * * * *}",
            zone = "${app.service-balance.reconcile-zone:Asia/Kolkata}")
    @SchedulerLock(
            name = "serviceBalance-reconcilePendingTopUps",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT15S")
    public void reconcilePendingTopUps() {
        int pending = topUpService.reconcilePendingSweep();

        if (pending > 0) {
            log.info("Service balance reconciliation checked pending top-ups count={}", pending);
        }
    }

    /** Closes checkouts nobody finished, so the list stops growing. */
    @Scheduled(
            cron = "${app.service-balance.expiry-cron:0 */15 * * * *}",
            zone = "${app.service-balance.expiry-zone:Asia/Kolkata}")
    @SchedulerLock(
            name = "serviceBalance-expireAbandonedTopUps",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT15S")
    public void expireAbandonedTopUps() {
        int expired = topUpService.expireAbandoned();

        if (expired > 0) {
            log.info("Service balance expired abandoned checkouts count={}", expired);
        }
    }
}
