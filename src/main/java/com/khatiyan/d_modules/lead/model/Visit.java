package com.khatiyan.d_modules.lead.model;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
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

    /**
     * Whether it can be given another date (owner's rule, 2026-10-03).
     *
     * <p>Before its day, as often as the mover is allowed. After it was missed,
     * which is how a missed visit gets a second chance: it is moved, never
     * booked again. Not on the day itself: by then it is either happening or
     * about to be missed.
     */
    public boolean canBeMoved(LocalDate today) {
        return status == VisitStatus.NOT_VISITED || (isLive() && !visitDate.equals(today));
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
     * How many more times the prospect may move it themselves, from the count
     * that applies today: the one for after a miss once it was missed, the one
     * for before its date until then.
     */
    public int tenantReschedulesLeft(LocalDate today) {
        int used = isMissed(today) ? tenantMissedReschedules : tenantReschedules;
        return Math.max(0, MAX_TENANT_RESCHEDULES - used);
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
     * The prospect moves it: twice before its date, twice more after missing
     * it. Past either, the property has to.
     */
    public void moveByTenant(LocalDate date, LocalTime slotStart, LocalTime slotEnd, LocalDate today) {
        boolean missed = isMissed(today);
        if (tenantReschedulesLeft(today) == 0) {
            throw new ValidationException(tenantLimitMessage(missed));
        }
        move(date, slotStart, slotEnd);
        if (missed) {
            this.tenantMissedReschedules++;
        } else {
            this.tenantReschedules++;
        }
    }

    /** What the prospect is told once the count that applies is used up. */
    public static String tenantLimitMessage(boolean missed) {
        return missed
                ? "You have rescheduled this missed visit twice. Ask the property to move it."
                : "You have rescheduled this visit twice. Ask the property to move it.";
    }

    /** The handler or the owner moves it. Not counted. */
    public void moveByHandler(LocalDate date, LocalTime slotStart, LocalTime slotEnd) {
        move(date, slotStart, slotEnd);
    }

    private void move(LocalDate date, LocalTime slotStart, LocalTime slotEnd) {
        if (status != VisitStatus.SCHEDULED && status != VisitStatus.NOT_VISITED) {
            throw new ValidationException("This visit can no longer be moved.");
        }
        // A missed visit given a new date is a visit to turn up to again.
        this.status = VisitStatus.SCHEDULED;
        this.visitDate = date;
        this.slotStartMinute = minuteOf(slotStart);
        this.slotEndMinute = minuteOf(slotEnd);
    }

    private static int minuteOf(LocalTime time) {
        return time.equals(LocalTime.MAX) ? 1440 : time.getHour() * 60 + time.getMinute();
    }
}
