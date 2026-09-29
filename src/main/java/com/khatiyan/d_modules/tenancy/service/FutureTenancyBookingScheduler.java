package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import lombok.extern.slf4j.Slf4j;

/** Starts signed future bookings only after their source room change completed. */
@Slf4j
@Component
public class FutureTenancyBookingScheduler {

    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final TenancyService tenancyService;
    private final TenancyRoomChangeRequestService roomChangeRequestService;
    private final int batchSize;

    public FutureTenancyBookingScheduler(
            TenancyService tenancyService,
            @Lazy TenancyRoomChangeRequestService roomChangeRequestService,
            @Value("${app.tenancy.future-booking-batch-size:100}") int batchSize) {
        this.tenancyService = tenancyService;
        this.roomChangeRequestService = roomChangeRequestService;
        this.batchSize = batchSize;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "tenancy-futureBooking-startup", lockAtMostFor = "PT15M")
    public void catchUpOnStartup() {
        activateDue();
    }

    // Runs after the 00:12 room-change job, then hourly to catch a transfer
    // delayed by an outage or an agreement accepted after midnight.
    @Scheduled(cron = "${app.tenancy.future-booking-cron:0 20 * * * *}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "tenancy-activateFutureBookings", lockAtMostFor = "PT15M")
    public void activateDue() {
        LocalDate today = LocalDate.now(ZONE);
        retryBookedMoves(today);
        for (UUID tenancyId : tenancyService.findDueScheduledIds(today, batchSize)) {
            try {
                tenancyService.activateScheduledBooking(tenancyId, today);
            } catch (RuntimeException exception) {
                log.error("Future tenancy booking could not activate tenancyId={}", tenancyId, exception);
            }
        }
    }

    /**
     * A booked move that failed stays approved (owner's rule, 2026-09-27: retry
     * at intervals, tell the owner once). Retrying here, before the bookings,
     * lets a move fixed during the day start its booking within the hour.
     */
    private void retryBookedMoves(LocalDate today) {
        for (UUID requestId : roomChangeRequestService.findDueBookedRequestIds(today, batchSize)) {
            try {
                roomChangeRequestService.executeDueApprovedRequest(requestId);
            } catch (RuntimeException exception) {
                try {
                    roomChangeRequestService.closeAfterExecutionFailure(requestId, exception);
                } catch (RuntimeException closeException) {
                    log.error("Could not record failed booked room change requestId={}", requestId, closeException);
                }
            }
        }
    }
}
