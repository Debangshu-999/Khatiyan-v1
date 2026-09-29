package com.khatiyan.d_modules.analytics.snapshot;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Records every active property's end-of-day state, spec §6.4.
 *
 * <p>Runs at 00:05 IST, before billing's 00:20 overdue marker, so what it reads
 * is still the state the previous day ended in. One run per night: a night
 * that fails is logged and stays blank, because the rule is that Khatiyan only
 * shows what it recorded.
 */
@Slf4j
@Component
public class PropertyDailySnapshotJob {

    private final PropertyAnalytics propertyAnalytics;
    private final TenancyAnalytics tenancyAnalytics;
    private final BillingAnalytics billingAnalytics;
    private final PropertyDailySnapshotWriter writer;
    private final ZoneId zone;

    public PropertyDailySnapshotJob(
            PropertyAnalytics propertyAnalytics,
            TenancyAnalytics tenancyAnalytics,
            BillingAnalytics billingAnalytics,
            PropertyDailySnapshotWriter writer,
            @Value("${app.analytics.daily-snapshot-zone:Asia/Kolkata}") String zone) {
        this.propertyAnalytics = propertyAnalytics;
        this.tenancyAnalytics = tenancyAnalytics;
        this.billingAnalytics = billingAnalytics;
        this.writer = writer;
        this.zone = ZoneId.of(zone);
    }

    @Scheduled(
            cron = "${app.analytics.daily-snapshot-cron:0 5 0 * * *}",
            zone = "${app.analytics.daily-snapshot-zone:Asia/Kolkata}")
    @SchedulerLock(name = "analytics-dailySnapshot", lockAtMostFor = "PT30M", lockAtLeastFor = "PT30S")
    public void captureYesterday() {
        captureFor(LocalDate.now(zone).minusDays(1));
    }

    int captureFor(LocalDate day) {
        int written = 0;
        for (UUID propertyId : propertyAnalytics.activePropertyIds()) {
            try {
                writer.upsert(snapshotOf(propertyId, day));
                written++;
            } catch (RuntimeException e) {
                log.warn("Analytics daily snapshot failed for property {} day {}", propertyId, day, e);
            }
        }
        log.info("Analytics daily snapshot wrote {} properties for {}", written, day);
        return written;
    }

    private PropertyDailySnapshot snapshotOf(UUID propertyId, LocalDate day) {
        PropertyAnalytics.BedCounts beds = propertyAnalytics.bedCounts(propertyId);
        TenancyAnalytics.ActiveStays stays = tenancyAnalytics.activeStays(propertyId);
        BillingAnalytics.DuesTotals dues = billingAnalytics.duesTotals(propertyId);
        BillingAnalytics.Deposits deposits = billingAnalytics.deposits(propertyId);
        return new PropertyDailySnapshot(propertyId, day,
                beds.totalBeds(), beds.occupiedBeds(), beds.reservedBeds(), beds.unavailableBeds(),
                stays.monthly(), stays.daily(),
                dues.outstandingPaise(), dues.overduePaise(), deposits.heldPaise(),
                Instant.now());
    }
}
