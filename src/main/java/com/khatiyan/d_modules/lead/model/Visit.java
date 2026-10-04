package com.khatiyan.d_modules.lead.model;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A prospect's visit to a property: a date and one of the property's slots.
 *
 * <p>The slot's times are copied here. The owner can change the property's
 * visit slots afterwards, and a visit already agreed must not move because of
 * it.
 *
 * <p>Times of day are minutes from midnight. A TIME column written through the
 * JDBC driver lands 5:30 early in this database.
 *
 * <p><b>The visit day</b> (user, 2026-10-04). Attendance is marked at the
 * property, by scanning the visitor's pass or typing the code on it. Who may
 * move the visit turns on the clock: the property until two hours before the
 * slot, the visitor by {@link VisitWindow}. Every rule here takes the time in
 * India as an argument, so it can be checked at any hour.
 */
@Entity
@Table(name = "visits", schema = "lead")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Visit extends BaseEntity {

    /**
     * How many times the prospect may move a visit themselves: twice before its
     * date, and twice more once it was missed (owner's rule, 2026-10-03). Two
     * counts, so neither kind of move can go on for ever.
     */
    public static final int MAX_TENANT_RESCHEDULES = 2;

    /** The property may move or cancel a visit until this long before its slot. After that only the visitor can. */
    public static final Duration MANAGEMENT_CUTOFF = Duration.ofHours(2);

    /** The visitor's pass opens this long before the slot. */
    public static final Duration PASS_OPENS_BEFORE = Duration.ofHours(1);

    /** How long the visitor of a No visit has to say they are still interested, by moving it. */
    public static final Duration STILL_INTERESTED_FOR = Duration.ofDays(7);

    private static final int MAX_PARTY_SIZE = 20;

    /** The visitor is reminded at this hour the day before, while they can still reschedule. */
    public static final LocalTime DAY_BEFORE_REMINDER_AT = LocalTime.of(10, 0);

    /** And again this long before their slot, while they can still change slots. */
    public static final Duration TODAY_REMINDER_BEFORE = Duration.ofHours(2);

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, updatable = false, length = 40)
    private String referenceCode;

    @Column(name = "lead_id", nullable = false, updatable = false)
    private UUID leadId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "prospect_user_id", nullable = false, updatable = false)
    private UUID prospectUserId;

    @Column(name = "enquiry_id", updatable = false)
    private UUID enquiryId;

    @Column(name = "visit_date", nullable = false)
    private LocalDate visitDate;

    @Column(name = "slot_start_minute", nullable = false)
    private int slotStartMinute;

    @Column(name = "slot_end_minute", nullable = false)
    private int slotEndMinute;

    @Enumerated(EnumType.STRING)
    @Column(name = "booked_by", nullable = false, updatable = false, length = 10)
    private VisitBookedBy bookedBy;

    @Column(name = "booked_by_user_id", nullable = false, updatable = false)
    private UUID bookedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VisitStatus status;

    /** Moves the prospect made before the visit date. */
    @Column(name = "tenant_reschedules", nullable = false)
    private int tenantReschedules;

    /** Moves the prospect made after missing it. */
    @Column(name = "tenant_missed_reschedules", nullable = false)
    private int tenantMissedReschedules;

    /** Which side cancelled it. Null while it is not cancelled. */
    @Enumerated(EnumType.STRING)
    @Column(name = "cancelled_by", length = 10)
    private VisitBookedBy cancelledBy;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    /** Why it was cancelled. Required since 2026-10-03, null on older ones. */
    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    /** What the pass's QR holds, for the slot it is in now. Null until the visitor opens the pass. */
    @Column(name = "pass_token", length = 64)
    private String passToken;

    /** The six digits on the pass, read out when it cannot be scanned. */
    @Column(name = "pass_code", length = 6)
    private String passCode;

    /** When attendance was marked. Null until it is. */
    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    /** Who marked it: whoever was at the property, or the owner afterwards. They fill the visit form. */
    @Column(name = "checked_in_by_user_id")
    private UUID checkedInByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "check_in_method", length = 10)
    private VisitCheckInMethod checkInMethod;

    /** Minutes from midnight at check-in. Null when the owner marked it afterwards: nobody saw them arrive. */
    @Column(name = "arrived_minute")
    private Integer arrivedMinute;

    @Column(name = "departed_minute")
    private Integer departedMinute;

    @Column(name = "party_size")
    private Integer partySize;

    @Enumerated(EnumType.STRING)
    @Column(name = "impression", length = 10)
    private VisitImpression impression;

    @Column(name = "form_completed_at")
    private Instant formCompletedAt;

    @Column(name = "form_completed_by_user_id")
    private UUID formCompletedByUserId;

    /** When the night's sweep marked it No visit. Cleared when the visitor moves it. */
    @Column(name = "no_visit_at")
    private Instant noVisitAt;

    /** When the day-before reminder went out, for the date it is on now. */
    @Column(name = "reminded_day_before_at")
    private Instant remindedDayBeforeAt;

    /** When the two-hours-before reminder went out, for the slot it is in now. */
    @Column(name = "reminded_today_at")
    private Instant remindedTodayAt;

    /** When the visitor said "I'm on my way", past half their slot. The property is told once. */
    @Column(name = "running_late_at")
    private Instant runningLateAt;

    /**
     * The date and slot it was in before its latest move, and when it moved.
     * The day it left still lists it, as Rescheduled (user, 2026-10-04).
     */
    @Column(name = "moved_from_date")
    private LocalDate movedFromDate;

    @Column(name = "moved_from_slot_start_minute")
    private Integer movedFromSlotStartMinute;

    @Column(name = "moved_from_slot_end_minute")
    private Integer movedFromSlotEndMinute;

    @Column(name = "moved_at")
    private Instant movedAt;

    private Visit(
            String referenceCode, UUID leadId, UUID propertyId, UUID prospectUserId, UUID enquiryId,
            LocalDate visitDate, int slotStartMinute, int slotEndMinute,
            VisitBookedBy bookedBy, UUID bookedByUserId) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.leadId = leadId;
        this.propertyId = propertyId;
        this.prospectUserId = prospectUserId;
        this.enquiryId = enquiryId;
        this.visitDate = visitDate;
        this.slotStartMinute = slotStartMinute;
        this.slotEndMinute = slotEndMinute;
        this.bookedBy = bookedBy;
        this.bookedByUserId = bookedByUserId;
        this.status = VisitStatus.SCHEDULED;
    }

    public static Visit schedule(
            String referenceCode, UUID leadId, UUID propertyId, UUID prospectUserId, UUID enquiryId,
            LocalDate visitDate, LocalTime slotStart, LocalTime slotEnd,
            VisitBookedBy bookedBy, UUID bookedByUserId) {
        return new Visit(
                referenceCode, leadId, propertyId, prospectUserId, enquiryId,
                visitDate, minuteOf(slotStart), minuteOf(slotEnd), bookedBy, bookedByUserId);
    }

    public boolean isLive() {
        return status == VisitStatus.SCHEDULED;
    }

    /**
     * Still to happen: scheduled, for today or later.
     *
     * <p>A visit whose date has passed goes on saying SCHEDULED until someone
     * reviews it. It is no longer something to turn up to, or to move.
     */
    public boolean isUpcoming(LocalDate today) {
        return isLive() && !visitDate.isBefore(today);
    }

    /**
     * Missed: its date has passed and nobody recorded that they came, or the
     * review recorded that they did not.
     */
    public boolean isMissed(LocalDate today) {
        return status == VisitStatus.NOT_VISITED || (isLive() && visitDate.isBefore(today));
    }

    // ---- The clock on the visit day -----------------------------------------

    public LocalDateTime slotStartsAt() {
        return visitDate.atStartOfDay().plusMinutes(slotStartMinute);
    }

    public LocalDateTime slotEndsAt() {
        return visitDate.atStartOfDay().plusMinutes(slotEndMinute);
    }

    /** Half the slot gone: from here a visitor nobody has checked in is running late. */
    public LocalDateTime runningLateFrom() {
        return slotStartsAt().plusMinutes(halfSlotMinutes());
    }

    public LocalDateTime passOpensAt() {
        return slotStartsAt().minus(PASS_OPENS_BEFORE);
    }

    /** Midnight at the end of the visit's day: the pass is theirs to show until then (user, 2026-10-04). */
    public LocalDateTime passClosesAt() {
        return visitDate.plusDays(1).atStartOfDay();
    }

    public LocalDateTime managementCutoffAt() {
        return slotStartsAt().minus(MANAGEMENT_CUTOFF);
    }

    private int halfSlotMinutes() {
        return (slotEndMinute - slotStartMinute) / 2;
    }

    /**
     * Whether the property may still move or cancel it: until two hours before
     * its slot (user, 2026-10-04). Never one that was missed, which is the
     * visitor's alone to move.
     */
    public boolean managementMayChange(LocalDateTime now) {
        return isLive() && now.isBefore(managementCutoffAt());
    }

    /** Where it stands for the visitor at this moment. */
    public VisitWindow prospectWindow(LocalDateTime now) {
        if (status == VisitStatus.NOT_VISITED) {
            return VisitWindow.MISSED;
        }
        if (!isLive()) {
            return VisitWindow.CLOSED;
        }
        LocalDate today = now.toLocalDate();
        if (visitDate.isBefore(today)) {
            return VisitWindow.MISSED;
        }
        if (visitDate.isAfter(today)) {
            return VisitWindow.BEFORE_DAY;
        }
        if (now.isBefore(slotStartsAt())) {
            return VisitWindow.DAY_BEFORE_SLOT;
        }
        return now.isBefore(runningLateFrom()) ? VisitWindow.IN_SLOT : VisitWindow.RUNNING_LATE;
    }

    // ---- The pass and checking in -------------------------------------------

    /**
     * From an hour before the slot until the day is over. It used to go when
     * the slot ended, which left a visitor who turned up late with nothing to
     * show at the door.
     */
    public boolean isPassOpen(LocalDateTime now) {
        return isLive() && !now.isBefore(passOpensAt()) && now.isBefore(passClosesAt());
    }

    public boolean hasPass() {
        return passToken != null;
    }

    public void issuePass(String token, String code) {
        this.passToken = token;
        this.passCode = code;
    }

    public boolean isCheckedIn() {
        return status == VisitStatus.VISITED;
    }

    /**
     * At the property, from the start of the slot until the day is over (user,
     * 2026-10-04): someone may never say they are running late, nor move their
     * slot, and still turn up after it. Their pass lets them in, as late.
     */
    public boolean isCheckInOpen(LocalDateTime now) {
        return isLive() && !now.isBefore(slotStartsAt()) && now.isBefore(passClosesAt());
    }

    /**
     * The owner's own: after the slot, before midnight, for a visitor who came
     * and whose pass nobody scanned. It needs no pass, which is why it is the
     * owner's alone.
     */
    public boolean isMissedCheckInOpen(LocalDateTime now) {
        return isLive() && now.toLocalDate().equals(visitDate) && now.isAfter(slotEndsAt());
    }

    /** Marks attendance at the property. Whoever does it is in charge of the visit form. */
    public void checkIn(UUID byUserId, VisitCheckInMethod method, Instant at, LocalDateTime now) {
        if (isCheckedIn()) {
            throw new ValidationException("They are already checked in.");
        }
        if (!isCheckInOpen(now)) {
            throw new ValidationException(!isLive()
                    ? "This visit can no longer be checked in."
                    : now.isBefore(slotStartsAt())
                            ? "Check-in opens when their slot starts."
                            : "The day of this visit is over, so it can no longer be checked in.");
        }
        this.status = VisitStatus.VISITED;
        this.checkedInAt = at;
        this.checkedInByUserId = byUserId;
        this.checkInMethod = method;
        this.arrivedMinute = now.getHour() * 60 + now.getMinute();
    }

    /** The owner marks a visitor who came and was never scanned. No arrival time: nobody recorded one. */
    public void markMissedCheckIn(UUID ownerUserId, Instant at, LocalDateTime now) {
        if (isCheckedIn()) {
            throw new ValidationException("They are already checked in.");
        }
        if (!isMissedCheckInOpen(now)) {
            throw new ValidationException("A missed check-in is marked after the slot has ended, before midnight.");
        }
        this.status = VisitStatus.VISITED;
        this.checkedInAt = at;
        this.checkedInByUserId = ownerUserId;
        this.checkInMethod = VisitCheckInMethod.OWNER;
        this.arrivedMinute = null;
    }

    /** Past half the slot when they were checked in. Null when nobody saw them arrive. */
    public Boolean arrivedLate() {
        return arrivedMinute == null ? null : arrivedMinute >= slotStartMinute + halfSlotMinutes();
    }

    /**
     * Not checked in by midnight: No visit (user, 2026-10-04). Called by the
     * night's sweep, never on the visit's own day.
     *
     * @return true when it was marked now
     */
    public boolean markNoVisit(Instant at, LocalDate today) {
        if (!isLive() || !visitDate.isBefore(today)) {
            return false;
        }
        this.status = VisitStatus.NOT_VISITED;
        this.noVisitAt = at;
        return true;
    }

    /**
     * Whether its latest move took it off this date, to another day. A change
     * of slot within the day is not one: the visit is still that day's.
     */
    public boolean wasMovedOffDate(LocalDate date) {
        return date.equals(movedFromDate) && !date.equals(visitDate);
    }

    /**
     * Whether its latest move was made on or after the day it was then booked
     * for (user, 2026-10-04): it did not happen when it was due and was given
     * a new time, which the enquiry's card says as "Visit rescheduled". A
     * move made ahead of its day is an ordinary change of plan, and the card
     * goes on saying "Visit scheduled".
     *
     * @param zone the zone the visit's dates are kept in
     */
    public boolean wasRescheduledOnOrAfterItsDay(ZoneId zone) {
        return movedAt != null && movedFromDate != null
                && !LocalDate.ofInstant(movedAt, zone).isBefore(movedFromDate);
    }

    // ---- Reminders and running late -----------------------------------------

    /** From 10 am the day before, once (user, 2026-10-04). */
    public boolean dueDayBeforeReminder(LocalDateTime now) {
        return isLive()
                && remindedDayBeforeAt == null
                && visitDate.equals(now.toLocalDate().plusDays(1))
                && !now.toLocalTime().isBefore(DAY_BEFORE_REMINDER_AT);
    }

    public void markRemindedDayBefore(Instant at) {
        this.remindedDayBeforeAt = at;
    }

    /** From two hours before their slot until it starts, once. */
    public boolean dueTodayReminder(LocalDateTime now) {
        return isLive()
                && remindedTodayAt == null
                && !now.isBefore(slotStartsAt().minus(TODAY_REMINDER_BEFORE))
                && now.isBefore(slotStartsAt());
    }

    public void markRemindedToday(Instant at) {
        this.remindedTodayAt = at;
    }

    /**
     * The visitor says "I'm on my way": only once half their slot has gone
     * with nobody checking them in.
     *
     * @return true when it was said now, false when they had said so already
     */
    public boolean markRunningLate(Instant at, LocalDateTime now) {
        if (prospectWindow(now) != VisitWindow.RUNNING_LATE) {
            throw new ValidationException("You can say you are running late once half your slot has gone.");
        }
        if (runningLateAt != null) {
            return false;
        }
        this.runningLateAt = at;
        return true;
    }

    // ---- The visit form -----------------------------------------------------

    /**
     * When they left, how many came, and what they made of the place. Filled
     * once they are checked in, and none of it is required (user, 2026-10-04):
     * it takes what whoever received them knows. Saved again, how many came
     * and what they made of it are replaced. A time they left that is not
     * given stays as it was.
     */
    public void completeForm(
            UUID byUserId, LocalTime departedAt, Integer partySize, VisitImpression impression, Instant at) {
        if (!isCheckedIn()) {
            throw new ValidationException("Check them in before filling the visit form.");
        }
        if (departedAt == null && partySize == null && impression == null) {
            throw new ValidationException("Fill in at least one detail of the visit.");
        }
        if (partySize != null && (partySize < 1 || partySize > MAX_PARTY_SIZE)) {
            throw new ValidationException("Enter how many people came.");
        }
        if (departedAt != null) {
            int departed = minuteOf(departedAt);
            if (arrivedMinute != null && departed < arrivedMinute) {
                throw new ValidationException("They cannot have left before they arrived.");
            }
            this.departedMinute = departed;
        }
        this.partySize = partySize;
        this.impression = impression;
        this.formCompletedAt = at;
        this.formCompletedByUserId = byUserId;
    }

    /**
     * Nobody recorded when they left by the end of the day: they left when
     * their slot ended (user, 2026-10-04). Called by the sweep, never on the
     * visit's own day. Only the time: the form itself stays unfilled.
     *
     * @return true when the time was taken now
     */
    public boolean assumeLeftAtSlotEnd(LocalDate today) {
        if (!isCheckedIn() || departedMinute != null || !visitDate.isBefore(today)) {
            return false;
        }
        this.departedMinute = slotEndMinute;
        return true;
    }

    public boolean isFormCompleted() {
        return formCompletedAt != null;
    }

    public LocalTime getDepartedAt() {
        return departedMinute == null
                ? null
                : departedMinute >= 1440 ? LocalTime.MAX : LocalTime.ofSecondOfDay(departedMinute * 60L);
    }

    public LocalTime getSlotStart() {
        return LocalTime.ofSecondOfDay(slotStartMinute * 60L);
    }

    public LocalTime getSlotEnd() {
        // A slot can end at midnight, which is minute 1440 and not a time of day.
        return slotEndMinute >= 1440 ? LocalTime.MAX : LocalTime.ofSecondOfDay(slotEndMinute * 60L);
    }

    public boolean isIn(LocalDate date, LocalTime slotStart) {
        return visitDate.equals(date) && slotStartMinute == minuteOf(slotStart);
    }

    /**
     * How many more counted moves the prospect has, from the count that applies
     * now: the one for a miss once it was missed or they are running late, the
     * one for before the visit until then.
     */
    public int tenantReschedulesLeft(LocalDateTime now) {
        return Math.max(0, MAX_TENANT_RESCHEDULES - (countsAsMissed(prospectWindow(now))
                ? tenantMissedReschedules
                : tenantReschedules));
    }

    private static boolean countsAsMissed(VisitWindow window) {
        return window == VisitWindow.MISSED || window == VisitWindow.RUNNING_LATE;
    }

    /**
     * Cancels it, from either side, any time before it is done: before its day,
     * on it, or after it was missed (owner's rule, 2026-10-03). Its place in the
     * slot is freed.
     */
    public void cancel(VisitBookedBy by, Instant now, String reason) {
        if (!isLive()) {
            throw new ValidationException("This visit can no longer be cancelled.");
        }
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Give a reason for cancelling.");
        }
        this.status = VisitStatus.CANCELLED;
        this.cancelledBy = by;
        this.cancelledAt = now;
        this.cancelReason = trimmed;
    }

    /**
     * Starts with the reschedules a visit the tenant cancelled had left, both
     * counts (user, 2026-10-03). Without it, cancelling and booking again would
     * hand the tenant fresh ones.
     */
    public void carryTenantCountsFrom(Visit cancelled) {
        this.tenantReschedules = cancelled.tenantReschedules;
        this.tenantMissedReschedules = cancelled.tenantMissedReschedules;
    }

    /**
     * The prospect moves it (user, 2026-10-04):
     * <ul>
     * <li>before its day, twice;</li>
     * <li>on its day until half their slot has gone, the slot having started
     * or not, to another slot that day for free, or to another day as one of
     * those two;</li>
     * <li>running late, to a later slot that day for free, or to another day
     * as one of their two missed moves;</li>
     * <li>after a No visit, twice, on the missed count.</li>
     * </ul>
     * They may move it at any time until it is done: a slot that has started
     * used to hold them to it, and no longer does. Whether the slot they ask
     * for is on offer is the caller's to check.
     */
    public void moveByTenant(LocalDate date, LocalTime slotStart, LocalTime slotEnd, LocalDateTime now) {
        VisitWindow window = prospectWindow(now);
        if (window == VisitWindow.CLOSED) {
            throw new ValidationException("This visit can no longer be moved.");
        }
        boolean freeToday = window.onTheDay() && date.equals(now.toLocalDate());
        boolean missed = countsAsMissed(window);
        if (!freeToday && tenantReschedulesLeft(now) == 0) {
            throw new ValidationException(tenantLimitMessage(missed));
        }
        move(date, slotStart, slotEnd);
        if (freeToday) {
            return;
        }
        if (missed) {
            this.tenantMissedReschedules++;
        } else {
            this.tenantReschedules++;
        }
    }

    /** What the prospect is told once the count that applies is used up. */
    public static String tenantLimitMessage(boolean missed) {
        return missed
                ? "You have rescheduled this missed visit twice, so it can no longer be moved."
                : "You have rescheduled this visit twice. Ask the property to move it.";
    }

    /** Why the property may not move or cancel it now. Null when it may. */
    public String managementRefusal(LocalDateTime now, String doing) {
        if (managementMayChange(now)) {
            return null;
        }
        return isLive() && !visitDate.isBefore(now.toLocalDate())
                ? "A visit can be " + doing + " until two hours before its slot. After that only the visitor can."
                : "Only the visitor can move a missed visit.";
    }

    /** The handler or the owner moves it, until two hours before its slot. Not counted. */
    public void moveByHandler(LocalDate date, LocalTime slotStart, LocalTime slotEnd, LocalDateTime now) {
        String refusal = managementRefusal(now, "moved");
        if (refusal != null) {
            throw new ValidationException(refusal);
        }
        move(date, slotStart, slotEnd);
    }

    private void move(LocalDate date, LocalTime slotStart, LocalTime slotEnd) {
        if (status != VisitStatus.SCHEDULED && status != VisitStatus.NOT_VISITED) {
            throw new ValidationException("This visit can no longer be moved.");
        }
        // Where it was, for the list of the day it is leaving.
        this.movedFromDate = this.visitDate;
        this.movedFromSlotStartMinute = this.slotStartMinute;
        this.movedFromSlotEndMinute = this.slotEndMinute;
        this.movedAt = Instant.now();
        // A missed visit given a new date is a visit to turn up to again.
        this.status = VisitStatus.SCHEDULED;
        this.noVisitAt = null;
        this.visitDate = date;
        this.slotStartMinute = minuteOf(slotStart);
        this.slotEndMinute = minuteOf(slotEnd);
        // A pass belongs to one slot.
        this.passToken = null;
        this.passCode = null;
        // So do the reminders, and having said "I'm on my way".
        this.remindedDayBeforeAt = null;
        this.remindedTodayAt = null;
        this.runningLateAt = null;
    }

    private static int minuteOf(LocalTime time) {
        return time.equals(LocalTime.MAX) ? 1440 : time.getHour() * 60 + time.getMinute();
    }
}
