package com.khatiyan.d_modules.lead.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.booking.BookingModule;
import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitImpression;
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
import com.khatiyan.d_modules.tenancy.TenancyModule;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Tells a visitor how to go on, three hours after they were checked in (user,
 * 2026-10-09, built 2026-10-18): a mail, or a push and in-app notice when
 * they have no verified email.
 *
 * <p>Not between 9 pm and 9 am: one that falls due then waits for the
 * morning. Not told at all when the property recorded that they did not like
 * it, the enquiry is over or marked not interested, they already stay there,
 * or a booking is already going. Settled once per visit either way.
 *
 * <p>Only visits checked in within the last day and a half are looked at, so
 * turning this on did not tell every visitor there ever was.
 */
@Slf4j
@Service
public class AfterVisitTelling {

    static final Duration AFTER_CHECK_IN = Duration.ofHours(3);
    static final LocalTime QUIET_ENDS = LocalTime.of(9, 0);
    static final LocalTime QUIET_STARTS = LocalTime.of(21, 0);
    static final Duration LOOK_BACK = Duration.ofHours(36);

    private final VisitRepository visitRepository;
    private final VisitMails visitMails;
    private final EnquiryModule enquiryModule;
    private final BookingModule bookingModule;
    private final PropertyModule propertyModule;
    private final NotificationModule notificationModule;
    private final TenancyModule tenancyModule;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AfterVisitTelling(
            VisitRepository visitRepository,
            VisitMails visitMails,
            EnquiryModule enquiryModule,
            BookingModule bookingModule,
            PropertyModule propertyModule,
            NotificationModule notificationModule,
            @org.springframework.context.annotation.Lazy TenancyModule tenancyModule,
            RecordByRecord recordByRecord,
            JdbcTemplate jdbc,
            Clock clock) {
        this.visitRepository = visitRepository;
        this.visitMails = visitMails;
        this.enquiryModule = enquiryModule;
        this.bookingModule = bookingModule;
        this.propertyModule = propertyModule;
        this.notificationModule = notificationModule;
        this.tenancyModule = tenancyModule;
        this.recordByRecord = recordByRecord;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(cron = "0 */5 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "visit-after-telling", lockAtMostFor = "PT4M", lockAtLeastFor = "PT15S")
    public void sweep() {
        int told = tellDue();
        if (told > 0) {
            log.info("After-visit sweep told {} visitors", told);
        }
    }

    /** Settles every visit that is due now. Safe to run as often as it is called. */
    public int tellDue() {
        Instant now = clock.instant();
        if (isQuiet(now)) {
            return 0;
        }
        List<UUID> due = jdbc.queryForList("""
                SELECT id FROM lead.visits
                WHERE status = 'VISITED' AND after_visit_told_at IS NULL
                  AND checked_in_at <= ? AND checked_in_at >= ?
                ORDER BY checked_in_at
                """, UUID.class, Timestamp.from(now.minus(AFTER_CHECK_IN)), Timestamp.from(now.minus(LOOK_BACK)));
        return recordByRecord.run("visit-after", due, id -> id, this::tell);
    }

    /** Between 9 pm and 9 am in India. */
    static boolean isQuiet(Instant at) {
        LocalTime time = ZonedDateTime.ofInstant(at, LeadVisitService.IST).toLocalTime();
        return time.isBefore(QUIET_ENDS) || !time.isBefore(QUIET_STARTS);
    }

    /**
     * One visit, in its own transaction, read again: the visit form may have
     * been filled since the sweep looked.
     *
     * @return true when the visitor was told
     */
    @Transactional
    public boolean tell(UUID visitId) {
        Visit visit = visitRepository.findById(visitId).orElse(null);
        Instant now = clock.instant();
        if (visit == null || visit.getStatus() != VisitStatus.VISITED || visit.getAfterVisitToldAt() != null
                || visit.getCheckedInAt() == null || visit.getCheckedInAt().plus(AFTER_CHECK_IN).isAfter(now)) {
            return false;
        }
        visit.markAfterVisitTold(now);
        String skip = whyNot(visit, now);
        if (skip != null) {
            log.info("After-visit telling skipped visitId={} reason={}", visitId, skip);
            return false;
        }
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(visit.getPropertyId());
        } catch (NotFoundException gone) {
            return false;
        }
        LocalDate bookUntil = PostVisitBookingWindow.endsOn(visit.getVisitDate());
        if (visitMails.afterVisit(visit, property, bookUntil)) {
            log.info("After-visit mail queued visitId={}", visitId);
            return true;
        }
        // No verified email: the app says it instead (user, 2026-10-09).
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
                "Liked " + property.name() + "?",
                "Book a stay from this visit in My visits, until "
                        + PostVisitBookingWindow.endsOn(visit.getVisitDate()).format(
                                java.time.format.DateTimeFormatter.ofPattern("d MMMM", java.util.Locale.ENGLISH))
                        + ".",
                NotificationCategory.ENQUIRY, NotificationPriority.NORMAL, NotificationSubtype.VISIT_AFTER_BOOK_A_STAY,
                visit.getId(), data, NotificationDeliveryMode.IN_APP_AND_PUSH, NotificationAudience.TENANT);
        log.info("After-visit push sent visitId={}", visitId);
        return true;
    }

    /**
     * Why this visitor is not told how to book. Null when they are. The
     * twice-weekly reminder to book asks the same ({@link VisitBookingReminders}).
     */
    String whyNot(Visit visit, Instant now) {
        if (visit.getProspectUserId() == null) {
            return "walked in, no app";
        }
        if (visit.getImpression() == VisitImpression.DISLIKED) {
            return "did not like it";
        }
        boolean staysThere = tenancyModule.findActiveByUserId(visit.getProspectUserId())
                .filter(stay -> visit.getPropertyId().equals(stay.propertyId()))
                .isPresent();
        if (staysThere) {
            return "already stays there";
        }
        if (visit.getEnquiryId() == null) {
            return "no enquiry";
        }
        EnquirySnapshot enquiry = enquiryModule.findSnapshot(visit.getEnquiryId()).orElse(null);
        if (enquiry == null || enquiry.endedAt() != null || enquiry.sentiment() == EnquirySentiment.NOT_INTERESTED
                || !enquiry.bookingWindowOpen(now)) {
            return "enquiry over or not interested";
        }
        int fromThisVisit = 0;
        for (BookingSnapshot booking : bookingModule.snapshotsForEnquiries(List.of(visit.getEnquiryId()))) {
            if (booking.status().holdsBed() || booking.status() == BookingStatus.MOVED_IN) {
                return "a booking is already going";
            }
            if (visit.getId().equals(booking.visitId())) {
                fromThisVisit++;
            }
        }
        // A visit allows two requests. Both used, there is nothing left to book from it.
        if (fromThisVisit >= com.khatiyan.d_modules.booking.service.BookingPolicy.MAX_REQUESTS_PER_VISIT) {
            return "both requests from this visit used";
        }
        return null;
    }
}
