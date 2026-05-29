package com.khatiyan.d_modules.notice.model;

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
            LocalTime startTime,
            LocalTime endTime,
            LocalDate activeFrom,
            LocalDate activeUntil) {
        validateTimeWindow(startTime, endTime);
        this.id = UUID.randomUUID();
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
            LocalTime startTime,
            LocalTime endTime,
            LocalDate activeFrom,
            LocalDate activeUntil) {
        ensureActive();
        validateTimeWindow(startTime, endTime);
        this.title = title;
        this.body = body;
        this.priority = priority;
        this.frequency = frequency;
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

        if (frequency == RecurringNoticeFrequency.WEEKLY) {
            return activeFrom != null && date.getDayOfWeek() == activeFrom.getDayOfWeek();
        }

        if (frequency == RecurringNoticeFrequency.MONTHLY) {
            return activeFrom != null && isMonthlyGenerationDate(date);
        }

        return false;
    }

    private boolean isMonthlyGenerationDate(LocalDate date) {
        int configuredDay = activeFrom.getDayOfMonth();
        int lastDayOfCurrentMonth = date.lengthOfMonth();
        int generationDay = Math.min(configuredDay, lastDayOfCurrentMonth);

        return date.getDayOfMonth() == generationDay;
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

    private static void validateTimeWindow(LocalTime startTime, LocalTime endTime) {
        if (!endTime.isAfter(startTime)) {
            throw new ValidationException("Recurring notice endTime must be after startTime");
        }
    }
}
