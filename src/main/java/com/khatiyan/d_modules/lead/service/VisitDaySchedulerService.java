package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * What the night does to visits (user, 2026-10-04).
 *
 * <p>A visit nobody was checked in for becomes No visit once its day has
 * passed. A No visit whose visitor said nothing for a week takes its enquiry
 * with it.
 *
 * <p>Run every hour, not once at midnight: both steps only act on what is
 * already due, so a run that was missed while the server was down is made up
 * by the next one. A visit per transaction, so one that fails does not hold
 * the rest back.
 */
@Slf4j
@Service
public class VisitDaySchedulerService {

    private final VisitRepository visitRepository;
    private final VisitDayService visitDayService;
    private final RecordByRecord recordByRecord;
    private final Clock clock;

    public VisitDaySchedulerService(
            VisitRepository visitRepository,
            VisitDayService visitDayService,
            RecordByRecord recordByRecord,
            Clock clock) {
        this.visitRepository = visitRepository;
        this.visitDayService = visitDayService;
        this.recordByRecord = recordByRecord;
        this.clock = clock;
    }

    @Scheduled(cron = "0 5 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "visit-day-sweep", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sweep() {
        int noVisits = markNoVisits();
        int expired = expireUnansweredNoVisits();
        int departures = closeDepartures();
        if (noVisits > 0 || expired > 0 || departures > 0) {
            log.info("Visit day sweep marked {} visits No visit, ended {} left unanswered for a week,"
                    + " and took the slot's end as the leaving time of {}", noVisits, expired, departures);
        }
    }

    /**
     * Visits that happened on an earlier day with nobody recording when they
     * left: the end of their slot (user, 2026-10-04). The visit form is
     * optional, so this is what an unfilled one comes to.
     */
    public int closeDepartures() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), LeadVisitService.IST);
        List<UUID> due = visitRepository.findIdsVisitedWithoutDepartureBefore(today);
        return recordByRecord.run("visit-departure", due, id -> id, id -> visitDayService.closeDeparture(id, today));
    }

    /** Visits still scheduled whose day has passed: No visit. */
    public int markNoVisits() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), LeadVisitService.IST);
        List<UUID> due = visitRepository.findIdsScheduledBefore(today);
        return recordByRecord.run("visit-no-visit", due, id -> id, id -> visitDayService.markNoVisit(id, today));
    }

    /** No visits whose visitor said nothing for a week: the enquiry expires and the record ends. */
    public int expireUnansweredNoVisits() {
        List<UUID> due = visitRepository.findIdsNoVisitSince(Instant.now().minus(Visit.STILL_INTERESTED_FOR));
        return recordByRecord.run("visit-no-visit-expire", due, id -> id, visitDayService::expireUnanswered);
    }
}
