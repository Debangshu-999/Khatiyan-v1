package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Sends the visit notices that are due (user, 2026-10-04). See
 * {@link VisitNotificationService} for who is told what.
 *
 * <p>Every five minutes. One read of today's and tomorrow's scheduled visits
 * decides what is due. Each notice is then sent in its own transaction, so one
 * that fails does not hold the rest back, and none goes out twice.
 */
@Slf4j
@Service
public class VisitNotificationSchedulerService {

    /** The owner and managers hear who is coming today from this hour. */
    static final LocalTime VISITORS_TODAY_AT = LocalTime.of(7, 0);

    /** And who is coming in a slot this many minutes before it starts. */
    static final int SLOT_NOTICE_MINUTES_BEFORE = 15;

    private final VisitRepository visitRepository;
    private final VisitNotificationService notifier;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public VisitNotificationSchedulerService(
            VisitRepository visitRepository,
            VisitNotificationService notifier,
            RecordByRecord recordByRecord,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.visitRepository = visitRepository;
        this.notifier = notifier;
        this.recordByRecord = recordByRecord;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    /** One notice the property is due: about a day, or about a slot of it. */
    private record Notice(UUID propertyId, int slotStartMinute, String kind) {
    }

    @Scheduled(cron = "0 */5 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "visit-notifications", lockAtMostFor = "PT4M", lockAtLeastFor = "PT15S")
    public void sweep() {
        int sent = sendDue();
        if (sent > 0) {
            log.info("Visit notification sweep sent {} notices", sent);
        }
    }

    /** Sends everything due now. Safe to run as often as it is called. */
    public int sendDue() {
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), LeadVisitService.IST);
        LocalDate today = now.toLocalDate();
        List<Visit> visits = visitRepository.findByStatusAndVisitDateIn(
                VisitStatus.SCHEDULED, List.of(today, today.plusDays(1)));

        List<UUID> reminders = visits.stream()
                .filter(visit -> visit.dueDayBeforeReminder(now) || visit.dueTodayReminder(now))
                .map(Visit::getId)
                .toList();
        int sent = recordByRecord.run("visit-reminder", reminders, id -> id, notifier::remindVisitor);

        List<Notice> notices = noticesDue(visits, now);
        sent += recordByRecord.run("visit-notice", notices, Notice::toString, notice -> switch (notice.kind()) {
            case VisitNotificationService.VISITORS_TODAY -> notifier.tellOfToday(notice.propertyId(), today);
            case VisitNotificationService.SLOT_STARTING ->
                    notifier.tellOfSlot(notice.propertyId(), today, notice.slotStartMinute());
            default -> notifier.tellOfUnmarked(notice.propertyId(), today, notice.slotStartMinute());
        });
        return sent;
    }

    /** What the property is due about today's visits, less what has gone out already. */
    private List<Notice> noticesDue(List<Visit> visits, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        // Each slot once per property, with when it ends.
        Map<Notice, LocalDateTime> slots = new LinkedHashMap<>();
        Set<UUID> properties = new HashSet<>();
        for (Visit visit : visits) {
            if (!visit.getVisitDate().equals(today)) {
                continue;
            }
            properties.add(visit.getPropertyId());
            slots.putIfAbsent(
                    new Notice(visit.getPropertyId(), visit.getSlotStartMinute(), ""), visit.slotEndsAt());
        }
        if (properties.isEmpty()) {
            return List.of();
        }

        Set<Notice> gone = new HashSet<>(jdbcTemplate.query(
                "SELECT property_id, slot_start_minute, kind FROM lead.visit_notices WHERE visit_date = ?",
                (row, index) -> new Notice(
                        row.getObject("property_id", UUID.class), row.getInt("slot_start_minute"), row.getString("kind")),
                java.sql.Date.valueOf(today)));

        List<Notice> due = new ArrayList<>();
        if (!now.toLocalTime().isBefore(VISITORS_TODAY_AT)) {
            for (UUID property : properties) {
                add(due, gone, new Notice(
                        property, VisitNotificationService.WHOLE_DAY, VisitNotificationService.VISITORS_TODAY));
            }
        }
        slots.forEach((slot, endsAt) -> {
            LocalDateTime startsAt = today.atStartOfDay().plusMinutes(slot.slotStartMinute());
            if (!now.isBefore(startsAt.minusMinutes(SLOT_NOTICE_MINUTES_BEFORE)) && now.isBefore(endsAt)) {
                add(due, gone, new Notice(
                        slot.propertyId(), slot.slotStartMinute(), VisitNotificationService.SLOT_STARTING));
            }
            if (now.isAfter(endsAt)) {
                add(due, gone, new Notice(
                        slot.propertyId(), slot.slotStartMinute(), VisitNotificationService.ATTENDANCE_NOT_MARKED));
            }
        });
        return due;
    }

    private static void add(List<Notice> due, Set<Notice> gone, Notice notice) {
        if (!gone.contains(notice)) {
            due.add(notice);
        }
    }
}
