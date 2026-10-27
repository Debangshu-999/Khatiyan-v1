package com.khatiyan.d_modules.lead.service;

import java.sql.Date;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.repository.VisitRepository;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Reminds a visitor to book, Tuesday and Friday at 10 am (bookings plan,
 * chunk 7, built 2026-10-19), while the booking window of their visit is open
 * and nothing is booked from it. A push and an in-app notice, no mail.
 *
 * <p>Who is not reminded is the after-visit message's own rule
 * ({@link AfterVisitTelling#whyNot}): they did not like it, they stay there,
 * the enquiry is over or not interested, a booking is going, or both of the
 * visit's requests are used. Never on the day of the visit itself, which has
 * the after-visit message.
 */
@Slf4j
@Service
public class VisitBookingReminders {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMMM", Locale.ENGLISH);

    private final VisitRepository visitRepository;
    private final AfterVisitTelling afterVisit;
    private final PropertyModule propertyModule;
    private final NotificationModule notificationModule;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public VisitBookingReminders(VisitRepository visitRepository, AfterVisitTelling afterVisit,
            PropertyModule propertyModule, NotificationModule notificationModule, RecordByRecord recordByRecord,
            JdbcTemplate jdbc, Clock clock) {
        this.visitRepository = visitRepository;
        this.afterVisit = afterVisit;
        this.propertyModule = propertyModule;
        this.notificationModule = notificationModule;
        this.recordByRecord = recordByRecord;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 10 * * TUE,FRI", zone = "Asia/Kolkata")
    @SchedulerLock(name = "visit-booking-reminders", lockAtMostFor = "PT20M", lockAtLeastFor = "PT30S")
    public void sweep() {
        int told = remindDue();
        if (told > 0) {
            log.info("Visit booking reminders sent {}", told);
        }
    }

    /** Attended visits whose booking window can still be open, each in its own transaction. */
    public int remindDue() {
        LocalDate today = LocalDate.now(clock.withZone(LeadVisitService.IST));
        List<UUID> visits = jdbc.queryForList("""
                SELECT id FROM lead.visits
                WHERE status = 'VISITED' AND visit_date < ? AND visit_date >= ?
                """, UUID.class, Date.valueOf(today), Date.valueOf(today.minusDays(PostVisitBookingWindow.DAYS)));
        return recordByRecord.run("visit-booking-reminder", visits, id -> id, id -> remind(id, today));
    }

    @Transactional
    public boolean remind(UUID visitId, LocalDate today) {
        Visit visit = visitRepository.findById(visitId).orElse(null);
        Instant now = clock.instant();
        if (visit == null || visit.getStatus() != VisitStatus.VISITED || !visit.getVisitDate().isBefore(today)) {
            return false;
        }
        String skip = afterVisit.whyNot(visit, now);
        if (skip != null) {
            return false;
        }
        // The day's row first: a second run the same day finds it taken.
        if (jdbc.update("""
                INSERT INTO lead.visit_booking_reminders (visit_id, reminder_date) VALUES (?, ?)
                ON CONFLICT DO NOTHING
                """, visitId, Date.valueOf(today)) == 0) {
            return false;
        }
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(visit.getPropertyId());
        } catch (NotFoundException gone) {
            return false;
        }
        LocalDate bookUntil = PostVisitBookingWindow.endsOn(visit.getVisitDate());
        Map<String, String> data = new LinkedHashMap<>();
        data.put("visitId", visit.getId().toString());
        data.put("propertyId", visit.getPropertyId().toString());
        data.put("propertyName", property.name());
        data.put("visitReferenceCode", visit.getReferenceCode());
        data.put("bookUntil", bookUntil.toString());
        if (visit.getEnquiryId() != null) {
            data.put("enquiryId", visit.getEnquiryId().toString());
        }
        notificationModule.notifyUser(
                visit.getProspectUserId(),
                "Still thinking about " + property.name() + "?",
                "Book a stay from your visit in My visits, until " + DAY.format(bookUntil) + ".",
                NotificationCategory.ENQUIRY, NotificationPriority.NORMAL, NotificationSubtype.BOOKING_BOOK_AFTER_VISIT,
                visit.getId(), data, NotificationDeliveryMode.IN_APP_AND_PUSH, NotificationAudience.TENANT);
        log.info("Visit booking reminder sent visitId={}", visitId);
        return true;
    }
}
