package com.khatiyan.d_modules.notice.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Reusable rule that generates normal notice rows on a schedule.
 *
 * <p>Tenants never read recurring notices directly. The scheduler uses active
 * templates to create regular {@link Notice} rows with concrete visible windows.
 */
@Entity
@Table(name = "recurring_notices", schema = "notice")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecurringNotice extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 2000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NoticePriority priority;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecurringNoticeFrequency frequency;

    /**
     * The weekdays a WEEKLY template fires on. Empty for other frequencies.
     *
     * <p>A set, because "every Monday and Tuesday" is an ordinary schedule. Used
     * to be read off {@code activeFrom}, which meant "starts on" and "repeats
     * on" were the same input — one date could only ever name one weekday.
     */
    @ElementCollection
    @CollectionTable(
            name = "recurring_notice_days_of_week",
            schema = "notice",
            joinColumns = @JoinColumn(name = "recurring_notice_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", nullable = false, length = 40)
    private Set<DayOfWeek> daysOfWeek = new LinkedHashSet<>();

    /**
     * The days of the month a MONTHLY template fires on. Empty otherwise.
     *
     * <p>A set, because "the 1st and the 15th" is the ordinary case for rent
     * reminders and the old single day could not express it.
     */
    @ElementCollection
    @CollectionTable(
            name = "recurring_notice_days_of_month",
            schema = "notice",
            joinColumns = @JoinColumn(name = "recurring_notice_id"))
    @Column(name = "day_of_month", nullable = false)
    private Set<Integer> daysOfMonth = new LinkedHashSet<>();

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "active_from")
    private LocalDate activeFrom;

    @Column(name = "active_until")
    private LocalDate activeUntil;

    @Column(name = "last_generated_for_date")
    private LocalDate lastGeneratedForDate;

    @Column(name = "last_processed_for_date")
    private LocalDate lastProcessedForDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecurringNoticeStatus status;

    private RecurringNotice(
            UUID propertyId,
            UUID createdByUserId,
            String title,
            String body,
            NoticePriority priority,
            RecurringNoticeFrequency frequency,
            Collection<DayOfWeek> daysOfWeek,
            Collection<Integer> daysOfMonth,
            LocalTime startTime,
            LocalTime endTime,
            LocalDate activeFrom,
            LocalDate activeUntil) {
        validateTimeWindow(startTime, endTime);
        validateSchedule(frequency, daysOfWeek, daysOfMonth);
        this.id = UUID.randomUUID();
        this.daysOfWeek = scheduleWeekdays(frequency, daysOfWeek);
        this.daysOfMonth = scheduleMonthDays(frequency, daysOfMonth);
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        this.title = title;
        this.body = body;
        this.priority = priority;
        this.frequency = frequency;
        this.startTime = startTime;
        this.endTime = endTime;
        this.activeFrom = activeFrom;
        this.activeUntil = activeUntil;
        this.status = RecurringNoticeStatus.ACTIVE;
    }

    public static RecurringNotice create(
            UUID propertyId,
            UUID createdByUserId,
            String title,
            String body,
            NoticePriority priority,
            RecurringNoticeFrequency frequency,
            Collection<DayOfWeek> daysOfWeek,
            Collection<Integer> daysOfMonth,
            LocalTime startTime,
            LocalTime endTime,
            LocalDate activeFrom,
            LocalDate activeUntil) {
        return new RecurringNotice(
                propertyId,
                createdByUserId,
                title,
                body,
                priority,
                frequency,
                daysOfWeek,
                daysOfMonth,
                startTime,
                endTime,
                activeFrom,
                activeUntil);
    }

    public void updateDetails(
            String title,
            String body,
            NoticePriority priority,
            RecurringNoticeFrequency frequency,
            Collection<DayOfWeek> daysOfWeek,
            Collection<Integer> daysOfMonth,
            LocalTime startTime,
            LocalTime endTime,
            LocalDate activeFrom,
            LocalDate activeUntil) {
        ensureActive();
        validateTimeWindow(startTime, endTime);
        validateSchedule(frequency, daysOfWeek, daysOfMonth);
        this.title = title;
        this.body = body;
        this.priority = priority;
        this.frequency = frequency;
        // Reassigned through the same normalisers, so switching a template from
        // weekly to monthly cannot leave a stale weekday behind to fire on.
        this.daysOfWeek.clear();
        this.daysOfWeek.addAll(scheduleWeekdays(frequency, daysOfWeek));
        this.daysOfMonth.clear();
        this.daysOfMonth.addAll(scheduleMonthDays(frequency, daysOfMonth));
        this.startTime = startTime;
        this.endTime = endTime;
        this.activeFrom = activeFrom;
        this.activeUntil = activeUntil;
    }

    public boolean shouldGenerateFor(LocalDate date) {
        if (status != RecurringNoticeStatus.ACTIVE) {
            return false;
        }
        if (activeFrom != null && date.isBefore(activeFrom)) {
            return false;
        }
        if (activeUntil != null && date.isAfter(activeUntil)) {
            return false;
        }
        if (date.equals(lastGeneratedForDate)) {
            return false;
        }
        if (frequency == RecurringNoticeFrequency.DAILY) {
            return true;
        }

        // Read from the schedule fields, not from activeFrom. That date now
        // means only "not before this day"; it no longer smuggles the weekday
        // or the day-of-month along with it.
        if (frequency == RecurringNoticeFrequency.WEEKLY) {
            return daysOfWeek.contains(date.getDayOfWeek());
        }

        if (frequency == RecurringNoticeFrequency.MONTHLY) {
            return isMonthlyGenerationDate(date);
        }

        return false;
    }

    private boolean isMonthlyGenerationDate(LocalDate date) {
        return generationDaysIn(date).contains(date.getDayOfMonth());
    }

    /**
     * The days this template actually fires on in {@code date}'s month.
     *
     * <p>A day the month is too short for moves back to the last day, because
     * "the 31st" means the end of the month to whoever picked it. The subtlety
     * is what happens when two chosen days land on the same date: simply
     * clamping both made the 30th and the 31st collide, so a template asking
     * for two notices in April produced one — and in February the 30th, 31st
     * and 29th all collapsed onto the 28th.
     *
     * <p>So days are resolved from the end downwards and each takes the next
     * free date below one already taken. {30, 31} becomes the 29th and 30th in
     * April and the 27th and 28th in February — the last two days, which is
     * what choosing the last two days of the month means. Days the month can
     * hold are untouched: {1, 31} stays the 1st and the 28th.
     */
    private Set<Integer> generationDaysIn(LocalDate date) {
        int lastDayOfMonth = date.lengthOfMonth();
        Set<Integer> resolved = new LinkedHashSet<>();

        List<Integer> highestFirst = daysOfMonth.stream()
                .sorted(Comparator.reverseOrder())
                .toList();

        for (Integer day : highestFirst) {
            int candidate = Math.min(day, lastDayOfMonth);
            while (candidate >= 1 && resolved.contains(candidate)) {
                candidate--;
            }
            // Only reachable by choosing more days than the month has; the
            // surplus is dropped rather than wrapping into the previous month.
            if (candidate >= 1) {
                resolved.add(candidate);
            }
        }

        return resolved;
    }

    public void markGeneratedFor(LocalDate date) {
        this.lastGeneratedForDate = date;
    }

    public void markProcessedFor(LocalDate date) {
        this.lastProcessedForDate = date;
    }

    public void softDelete() {
        this.status = RecurringNoticeStatus.DELETED;
    }

    private void ensureActive() {
        if (status != RecurringNoticeStatus.ACTIVE) {
            throw new ValidationException("Deleted recurring notices cannot be updated");
        }
    }

    /**
     * A template must carry the schedule its frequency needs.
     *
     * <p>Rejected rather than defaulted: guessing a weekday from today would
     * silently create a template that fires on a day nobody chose, and the
     * owner would only find out a week later when it did not appear.
     */
    private static void validateSchedule(
            RecurringNoticeFrequency frequency, Collection<DayOfWeek> daysOfWeek, Collection<Integer> daysOfMonth) {
        if (frequency == RecurringNoticeFrequency.WEEKLY && (daysOfWeek == null || daysOfWeek.isEmpty())) {
            throw new ValidationException("Choose at least one day of the week this notice repeats on");
        }
        if (frequency == RecurringNoticeFrequency.MONTHLY && (daysOfMonth == null || daysOfMonth.isEmpty())) {
            throw new ValidationException("Choose at least one day of the month this notice repeats on");
        }
        if (daysOfMonth != null) {
            for (Integer day : daysOfMonth) {
                if (day == null || day < 1 || day > 31) {
                    throw new ValidationException("Days of the month must be between 1 and 31");
                }
            }
        }
    }

    /** Only a weekly template keeps weekdays; anything else stores an empty set. */
    private static Set<DayOfWeek> scheduleWeekdays(
            RecurringNoticeFrequency frequency, Collection<DayOfWeek> daysOfWeek) {
        if (frequency != RecurringNoticeFrequency.WEEKLY || daysOfWeek == null) {
            return new LinkedHashSet<>();
        }
        return new LinkedHashSet<>(daysOfWeek);
    }

    /** Only a monthly template keeps days; anything else stores an empty set. */
    private static Set<Integer> scheduleMonthDays(
            RecurringNoticeFrequency frequency, Collection<Integer> daysOfMonth) {
        if (frequency != RecurringNoticeFrequency.MONTHLY || daysOfMonth == null) {
            return new LinkedHashSet<>();
        }
        return new LinkedHashSet<>(daysOfMonth);
    }

    private static void validateTimeWindow(LocalTime startTime, LocalTime endTime) {
        if (!endTime.isAfter(startTime)) {
            throw new ValidationException("Recurring notice endTime must be after startTime");
        }
    }
}
