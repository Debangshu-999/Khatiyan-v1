package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Each morning, tells the property about every booked bed that must be freed
 * for a booking to start. See {@link BookingBedNoticeService}.
 *
 * <p>A booking per transaction, so one that fails does not hold the rest
 * back. Running it twice in a day says nothing twice: each booking is told
 * once a day. A run missed while the server was down is not made up later in
 * the week, because the notice is about today.
 */
@Slf4j
@Service
public class BookingBedNoticeScheduler {

    private final BookingBedNoticeService bedNotices;
    private final RecordByRecord recordByRecord;
    private final Clock clock;

    public BookingBedNoticeScheduler(BookingBedNoticeService bedNotices, RecordByRecord recordByRecord, Clock clock) {
        this.bedNotices = bedNotices;
        this.recordByRecord = recordByRecord;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.booking.bed-notice-cron}", zone = "${app.booking.expiry-zone}")
    @SchedulerLock(name = "booking-bed-notice", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void run() {
        notifyDue();
    }

    /** The work itself, which tests call directly. */
    public int notifyDue() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), BookingPolicy.ZONE);
        List<UUID> due = bedNotices.dueOn(today);
        int told = recordByRecord.run("booking-bed-notice", due, id -> id,
                id -> bedNotices.noticeIfBedNotFree(id, today));
        if (told > 0) {
            log.info("Booked bed notice told the property about {} beds still occupied", told);
        }
        return told;
    }
}
