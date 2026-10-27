package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Writes EXPIRED on booking requests nobody agreed in time, and on agreed
 * bookings whose token did not arrive in time, and frees their beds.
 *
 * <p>It only writes it. Whether a request is out of time is decided by its own
 * clock on every read and every action, so nothing waits for this job: a
 * request past its time already reads as expired and takes no action.
 *
 * <p>Run every hour, and once at startup for what lapsed while the server was
 * down. Each run acts only on what is already due. A request per transaction,
 * so one that fails or is changed at the same moment does not hold the rest
 * back, and is picked up by the next run.
 */
@Slf4j
@Service
public class BookingRequestExpiryScheduler {

    private final BookingRequestRepository requests;
    private final BookingRequestService requestService;
    private final RecordByRecord recordByRecord;
    private final Clock clock;

    public BookingRequestExpiryScheduler(BookingRequestRepository requests, BookingRequestService requestService,
            RecordByRecord recordByRecord, Clock clock) {
        this.requests = requests;
        this.requestService = requestService;
        this.recordByRecord = recordByRecord;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "booking-request-expiry-startupCatchUp", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void catchUpOnStartup() {
        expireDue();
    }

    @Scheduled(cron = "${app.booking.expiry-cron}", zone = "${app.booking.expiry-zone}")
    @SchedulerLock(name = "booking-request-expiry", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sweep() {
        expireDue();
    }

    /** The work itself, which tests call directly. */
    public int expireDue() {
        List<UUID> due = requests.findIdsOutOfTime(clock.instant());
        int expired = recordByRecord.run("booking-request-expire", due, id -> id, requestService::expireIfDue);
        if (expired > 0) {
            log.info("Booking request sweep expired {} requests nobody agreed in time", expired);
        }
        return expired;
    }
}
