package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
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

/**
 * Who is told what about visits, and when (user, 2026-10-04).
 *
 * <ul>
 * <li><b>The visitor:</b> at 10 am the day before, while they can still
 * reschedule, and two hours before their slot, while they can still change
 * slots.</li>
 * <li><b>The owner and every manager</b>, since anyone at the property checks a
 * visitor in: at 7 am how many people are coming today, 15 minutes before a
 * slot how many are coming in it, when a visitor says they are running late,
 * and when a slot ends with attendance not marked for someone who did not say
 * so. Only the owner can still mark that one, so the managers are told to tell
 * the owner.</li>
 * <li><b>Everyone, when a visitor is checked in:</b> the visitor, the owner and
 * every manager, each in their own words.</li>
 * </ul>
 *
 * <p>Each notice goes out once. A visitor's reminder is marked on the visit.
 * The property's notices are about a day or a slot, so each takes a row in
 * {@code lead.visit_notices} first: the insert is the claim, and a sweep that
 * runs twice finds the row already there.
 */
@Slf4j
@Service
public class VisitNotificationService {

    /** The property's notice that has no slot of its own: the day's. */
    static final int WHOLE_DAY = -1;

    static final String VISITORS_TODAY = "VISITORS_TODAY";
    static final String SLOT_STARTING = "SLOT_STARTING";
    static final String ATTENDANCE_NOT_MARKED = "ATTENDANCE_NOT_MARKED";

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final VisitRepository visitRepository;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public VisitNotificationService(
            VisitRepository visitRepository,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.visitRepository = visitRepository;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.notificationModule = notificationModule;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    // ---- The visitor --------------------------------------------------------

    /**
     * Sends whichever reminder this visit is due, and marks it sent. Read again
     * inside its own transaction: the visit may have moved since the sweep saw it.
     *
     * @return true when something was sent
     */
    @Transactional
    public boolean remindVisitor(UUID visitId) {
        Visit visit = visitRepository.findById(visitId).orElse(null);
        if (visit == null) {
            return false;
        }
        PropertyResponse property = propertyOf(visit.getPropertyId());
        if (property == null) {
            return false;
        }
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), LeadVisitService.IST);
        Instant at = Instant.now();
        boolean sent = false;
        if (visit.dueDayBeforeReminder(now)) {
            visit.markRemindedDayBefore(at);
            toVisitor(visit, property, NotificationSubtype.VISIT_REMINDER_DAY_BEFORE, "Visit tomorrow",
                    "Your visit to " + property.name() + " is tomorrow, " + LeadVisitService.when(visit)
                            + ". You can reschedule it until the end of today.");
            sent = true;
        }
        if (visit.dueTodayReminder(now)) {
            visit.markRemindedToday(at);
            toVisitor(visit, property, NotificationSubtype.VISIT_REMINDER_TODAY, "Visit today",
                    "Your visit to " + property.name() + " is today at " + clockTime(visit.getSlotStartMinute())
                            + ". Running behind? You can change to another slot today before yours starts.");
            sent = true;
        }
        return sent;
    }

    private void toVisitor(
            Visit visit, PropertyResponse property, NotificationSubtype subtype, String title, String body) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("visitId", visit.getId().toString());
        data.put("propertyId", visit.getPropertyId().toString());
        data.put("propertyName", property.name());
        data.put("visitWhen", LeadVisitService.when(visit));
        data.put("visitReferenceCode", visit.getReferenceCode());
        if (visit.getEnquiryId() != null) {
            data.put("enquiryId", visit.getEnquiryId().toString());
        }
        notificationModule.notifyUser(
                visit.getProspectUserId(), title, body, NotificationCategory.ENQUIRY, NotificationPriority.HIGH,
                subtype, visit.getId(), data, NotificationDeliveryMode.IN_APP_AND_PUSH, NotificationAudience.TENANT);
    }

    // ---- The property ---------------------------------------------------------

    /** At 7 am: how many people are visiting today. */
    @Transactional
    public boolean tellOfToday(UUID propertyId, LocalDate date) {
        if (!claim(propertyId, date, WHOLE_DAY, VISITORS_TODAY)) {
            return false;
        }
        long visitors = visitRepository.countByPropertyIdAndVisitDateAndStatus(propertyId, date, VisitStatus.SCHEDULED);
        PropertyResponse property = propertyOf(propertyId);
        if (visitors == 0 || property == null) {
            return false;
        }
        Map<String, String> data = dataFor(property, date, visitors);
        toProperty(property, NotificationSubtype.VISITORS_TODAY, "Visitors today",
                people(visitors) + " visiting " + property.name() + " today.", data, propertyId);
        return true;
    }

    /** 15 minutes before a slot: how many people are coming in it, and to mark their attendance. */
    @Transactional
    public boolean tellOfSlot(UUID propertyId, LocalDate date, int slotStartMinute) {
        if (!claim(propertyId, date, slotStartMinute, SLOT_STARTING)) {
            return false;
        }
        long visitors = visitRepository.countScheduled(propertyId, date, slotStartMinute);
        PropertyResponse property = propertyOf(propertyId);
        if (visitors == 0 || property == null) {
            return false;
        }
        Map<String, String> data = dataFor(property, date, visitors);
        data.put("visitSlot", clockTime(slotStartMinute));
        toProperty(property, NotificationSubtype.VISIT_SLOT_STARTING, "Visitors arriving",
                people(visitors) + " visiting " + property.name() + " in the " + clockTime(slotStartMinute)
                        + " slot. Mark their attendance when they arrive.",
                data, propertyId);
        return true;
    }

    /**
     * A slot has ended with attendance not marked for someone who did not say
     * they were running late. The owner is told to mark a missed check-in. The
     * managers cannot, so they are told to tell the owner.
     */
    @Transactional
    public boolean tellOfUnmarked(UUID propertyId, LocalDate date, int slotStartMinute) {
        if (!claim(propertyId, date, slotStartMinute, ATTENDANCE_NOT_MARKED)) {
            return false;
        }
        long unmarked = visitRepository.countUnmarkedInSlot(propertyId, date, slotStartMinute);
        PropertyResponse property = propertyOf(propertyId);
        if (unmarked == 0 || property == null) {
            return false;
        }
        Map<String, String> data = dataFor(property, date, unmarked);
        data.put("visitSlot", clockTime(slotStartMinute));
        String what = "Attendance was not marked for " + (unmarked == 1 ? "1 visitor" : unmarked + " visitors")
                + " in the " + clockTime(slotStartMinute) + " slot at " + property.name() + ".";
        for (UUID recipient : recipients(property)) {
            boolean owner = recipient.equals(property.ownerId());
            send(recipient, NotificationSubtype.VISIT_ATTENDANCE_NOT_MARKED, "Attendance not marked",
                    what + (owner
                            ? " If they came, mark a missed check-in before midnight."
                            : " If they came, tell the owner now. Only the owner can mark a missed check-in,"
                                    + " before midnight."),
                    data, propertyId);
        }
        return true;
    }

    /** A visitor said "I'm on my way". Runs in the transaction that recorded it. */
    public void tellOfRunningLate(Visit visit) {
        PropertyResponse property = propertyOf(visit.getPropertyId());
        if (property == null) {
            return;
        }
        String who = authModule.findById(visit.getProspectUserId())
                .map(UserSummaryResponse::fullName)
                .orElse("A visitor");
        Map<String, String> data = new LinkedHashMap<>();
        data.put("visitId", visit.getId().toString());
        data.put("propertyId", visit.getPropertyId().toString());
        data.put("propertyName", property.name());
        data.put("visitWhen", LeadVisitService.when(visit));
        data.put("visitReferenceCode", visit.getReferenceCode());
        toProperty(property, NotificationSubtype.VISITOR_RUNNING_LATE, "Visitor running late",
                who + " is running late for their " + clockTime(visit.getSlotStartMinute()) + " visit to "
                        + property.name() + ".",
                data, visit.getId());
    }

    /**
     * A visitor was checked in: told to the visitor, the owner and every
     * manager, in the app and by push (user, 2026-10-04). The visitor reads
     * "your visit". The property reads who it was and who checked them in,
     * the one who did it included: it is the record that it went through.
     *
     * <p>An owner's missed check-in reads "marked as attended": nobody saw
     * them arrive, so there is no check-in time to give. Runs in the
     * transaction that recorded it.
     */
    public void tellOfCheckIn(Visit visit) {
        PropertyResponse property = propertyOf(visit.getPropertyId());
        if (property == null) {
            return;
        }
        Map<UUID, UserSummaryResponse> people = authModule.findByIds(
                Set.of(visit.getProspectUserId(), visit.getCheckedInByUserId()));
        String visitor = nameOf(people, visit.getProspectUserId(), "A visitor");
        String checker = nameOf(people, visit.getCheckedInByUserId(), "a manager");
        String day = DAY.format(visit.getVisitDate());
        boolean missedCheckIn = visit.getArrivedMinute() == null;
        String how = missedCheckIn
                ? "was marked as attended"
                : "was checked in at " + clockTime(visit.getArrivedMinute());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("visitId", visit.getId().toString());
        data.put("propertyId", visit.getPropertyId().toString());
        data.put("propertyName", property.name());
        data.put("visitWhen", LeadVisitService.when(visit));
        data.put("visitReferenceCode", visit.getReferenceCode());
        if (!missedCheckIn) {
            data.put("checkedInAt", clockTime(visit.getArrivedMinute()));
        }
        if (visit.getEnquiryId() != null) {
            data.put("enquiryId", visit.getEnquiryId().toString());
        }

        notificationModule.notifyUser(
                visit.getProspectUserId(), "Visit checked in",
                "Your visit to " + property.name() + " on " + day + " " + how + ".",
                NotificationCategory.ENQUIRY, NotificationPriority.HIGH, NotificationSubtype.VISIT_CHECKED_IN,
                visit.getId(), data, NotificationDeliveryMode.IN_APP_AND_PUSH, NotificationAudience.TENANT);
        toProperty(property, NotificationSubtype.VISIT_CHECKED_IN, "Visitor checked in",
                visitor + "'s visit to " + property.name() + " on " + day + " " + how
                        + (missedCheckIn ? " by the owner." : " by " + checker + "."),
                data, visit.getId());
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> people, UUID userId, String fallback) {
        UserSummaryResponse person = people.get(userId);
        return person == null || person.fullName() == null || person.fullName().isBlank()
                ? fallback
                : person.fullName();
    }

    // ---- Sending ----------------------------------------------------------------

    private void toProperty(
            PropertyResponse property, NotificationSubtype subtype, String title, String body,
            Map<String, String> data, UUID sourceId) {
        for (UUID recipient : recipients(property)) {
            send(recipient, subtype, title, body, data, sourceId);
        }
    }

    private void send(
            UUID recipient, NotificationSubtype subtype, String title, String body,
            Map<String, String> data, UUID sourceId) {
        notificationModule.notifyUser(
                recipient, title, body, NotificationCategory.ENQUIRY, NotificationPriority.HIGH,
                subtype, sourceId, data, NotificationDeliveryMode.IN_APP_AND_PUSH, NotificationAudience.MANAGEMENT);
    }

    /** The owner and every manager: whoever could be at the door. */
    private Set<UUID> recipients(PropertyResponse property) {
        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        return recipients;
    }

    /** Takes the notice's one row. False when it has gone out already. */
    private boolean claim(UUID propertyId, LocalDate date, int slotStartMinute, String kind) {
        return jdbcTemplate.update(
                "INSERT INTO lead.visit_notices (property_id, visit_date, slot_start_minute, kind)"
                        + " VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                propertyId, java.sql.Date.valueOf(date), slotStartMinute, kind) == 1;
    }

    private PropertyResponse propertyOf(UUID propertyId) {
        try {
            return propertyModule.getActiveProperty(propertyId);
        } catch (NotFoundException gone) {
            return null;
        }
    }

    private static Map<String, String> dataFor(PropertyResponse property, LocalDate date, long visitors) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("visitDate", date.toString());
        data.put("visitorCount", String.valueOf(visitors));
        return data;
    }

    private static String people(long count) {
        return count == 1 ? "1 person is" : count + " people are";
    }

    private static String clockTime(int minuteOfDay) {
        return TIME.format(LocalTime.ofSecondOfDay(Math.min(minuteOfDay, 1439) * 60L)).toLowerCase(Locale.ENGLISH);
    }
}
