package com.khatiyan.d_modules.payment.service;

import java.time.Duration;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Scheduled jobs owned by the payment module.
 *
 * <p>Payouts are deferred rather than estimated when the gateway has not yet
 * published what it charged for a payment. That is the safe choice at capture
 * time, but it leaves an owner unpaid — so something has to come back for them,
 * and this is it.
 */
@Slf4j
@Component
public class PaymentSchedulerService {

    private final PaymentTransferService paymentTransferService;
    private final PaymentRefundService paymentRefundService;
    private final Duration deferralGrace;
    private final int batchSize;

    public PaymentSchedulerService(
            PaymentTransferService paymentTransferService,
            PaymentRefundService paymentRefundService,
            @Value("${app.payment.deferred-transfer-grace-minutes:30}") int deferralGraceMinutes,
            @Value("${app.payment.deferred-transfer-batch-size:50}") int batchSize) {
        this.paymentTransferService = paymentTransferService;
        this.paymentRefundService = paymentRefundService;
        this.deferralGrace = Duration.ofMinutes(deferralGraceMinutes);
        this.batchSize = batchSize;
    }

    /**
     * Returns money that was captured but belongs to no bill.
     *
     * <p>Hourly rather than continuous: these are rare, and the tenant is owed
     * money either way, so predictability matters more than latency.
     */
    @Scheduled(
            cron = "${app.payment.unapplied-refund-cron:0 5 * * * *}",
            zone = "${app.payment.unapplied-refund-zone:Asia/Kolkata}")
    @SchedulerLock(name = "payment-refundUnappliedPayments", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void refundUnappliedPayments() {
        int refunded = paymentRefundService.refundUnappliedPayments();

        if (refunded == 0) {
            return;
        }

        log.info("Unapplied payments refunded count={}", refunded);
    }

    /**
     * Sends payouts that could not be made when the payment was captured.
     *
     * <p>The grace period keeps this from racing the capture path for a payment
     * that is only seconds old and whose fee simply has not landed yet.
     */
    @Scheduled(
            cron = "${app.payment.deferred-transfer-cron:0 */15 * * * *}",
            zone = "${app.payment.deferred-transfer-zone:Asia/Kolkata}")
    @SchedulerLock(name = "payment-retryDeferredTransfers", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void retryDeferredTransfers() {
        Instant deferredBefore = Instant.now().minus(deferralGrace);
        int sent = paymentTransferService.retryDeferredTransfers(deferredBefore, batchSize);

        if (sent == 0) {
            return;
        }

        log.info("Deferred owner payouts sent count={} deferredBefore={}", sent, deferredBefore);
    }
}
