package com.khatiyan.d_modules.compliance.service;

import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Expires tenancy agreements (and their pending tenancies) that were not
 * accepted within the acceptance window — the reserved bed is freed. Mirrors
 * the tenancy exit scheduler: find due ids, then execute each through the same
 * service method manual paths use.
 */
@Slf4j
@Component
public class AgreementExpiryScheduler {

    private final TenancyAgreementService tenancyAgreementService;
    private final int ttlDays;

    public AgreementExpiryScheduler(
            TenancyAgreementService tenancyAgreementService,
            @Value("${app.compliance.agreement-acceptance-ttl-days:3}") int ttlDays) {
        this.tenancyAgreementService = tenancyAgreementService;
        this.ttlDays = ttlDays;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "compliance-agreementExpiry-startupCatchUp", lockAtMostFor = "PT15M", lockAtLeastFor = "PT15S")
    public void expireOverdueAgreementsOnStartup() {
        log.info("Agreement expiry scheduler startup catch-up started");
        expireOverdueAgreements();
    }

    @Scheduled(
            cron = "${app.compliance.agreement-expiry-cron:0 30 0 * * *}",
            zone = "${app.compliance.agreement-expiry-zone:Asia/Kolkata}")
    @SchedulerLock(name = "compliance-expireOverdueAgreements", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void expireOverdueAgreements() {
        List<UUID> tenancyIds = tenancyAgreementService.findExpiredPendingTenancyIds(ttlDays);

        if (tenancyIds.isEmpty()) {
            log.info("Agreement expiry scheduler found no overdue pending agreements ttlDays={}", ttlDays);
            return;
        }

        int expiredCount = 0;
        int failedCount = 0;
        for (UUID tenancyId : tenancyIds) {
            try {
                tenancyAgreementService.expirePendingAgreement(tenancyId);
                expiredCount = expiredCount + 1;
            } catch (RuntimeException exception) {
                failedCount = failedCount + 1;
                log.error("Agreement expiry scheduler failed tenancyId={}", tenancyId, exception);
            }
        }

        log.info(
                "Agreement expiry scheduler completed found={} expired={} failed={}",
                tenancyIds.size(),
                expiredCount,
                failedCount);
    }
}
