package com.khatiyan.d_modules.reminder.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "reminder_records", schema = "reminder")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReminderRecord extends BaseEntity {

    @Id
    private UUID id;

    @Column(name = "reminder_key", nullable = false, unique = true, length = 220)
    private String reminderKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "reminder_type", nullable = false, length = 80)
    private ReminderType reminderType;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 80)
    private ReminderSourceType sourceType;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    @Column(name = "recipient_user_id", nullable = false)
    private UUID recipientUserId;

    @Column(name = "property_id")
    private UUID propertyId;

    @Column(name = "tenancy_id")
    private UUID tenancyId;

    @Column(name = "scheduled_for_date", nullable = false)
    private LocalDate scheduledForDate;

    @Column(name = "title", nullable = false, length = 160)
    private String title;

    @Column(name = "body", nullable = false, length = 1000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_category", nullable = false, length = 80)
    private NotificationCategory notificationCategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_priority", nullable = false, length = 40)
    private NotificationPriority notificationPriority;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_mode", nullable = false, length = 40)
    private NotificationDeliveryMode deliveryMode;

    /** Workspace this reminder belongs to; null = show in either. */
    @Enumerated(EnumType.STRING)
    @Column(name = "audience", length = 20)
    private NotificationAudience audience;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private ReminderStatus status;

    private ReminderRecord(
            String reminderKey,
            ReminderType reminderType,
            ReminderSourceType sourceType,
            UUID sourceId,
            UUID recipientUserId,
            UUID propertyId,
            UUID tenancyId,
            LocalDate scheduledForDate,
            String title,
            String body,
            NotificationCategory notificationCategory,
            NotificationPriority notificationPriority,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        this.id = UUID.randomUUID();
        this.reminderKey = reminderKey;
        this.reminderType = reminderType;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.recipientUserId = recipientUserId;
        this.propertyId = propertyId;
        this.tenancyId = tenancyId;
        this.scheduledForDate = scheduledForDate;
        this.title = title;
        this.body = body;
        this.notificationCategory = notificationCategory;
        this.notificationPriority = notificationPriority;
        this.deliveryMode = deliveryMode;
        this.audience = audience;
        this.status = ReminderStatus.PENDING;
    }

    public static ReminderRecord pending(
            String reminderKey,
            ReminderType reminderType,
            ReminderSourceType sourceType,
            UUID sourceId,
            UUID recipientUserId,
            UUID propertyId,
            UUID tenancyId,
            LocalDate scheduledForDate,
            String title,
            String body,
            NotificationCategory notificationCategory,
            NotificationPriority notificationPriority,
            NotificationDeliveryMode deliveryMode,
            NotificationAudience audience) {
        return new ReminderRecord(
                reminderKey,
                reminderType,
                sourceType,
                sourceId,
                recipientUserId,
                propertyId,
                tenancyId,
                scheduledForDate,
                title,
                body,
                notificationCategory,
                notificationPriority,
                deliveryMode,
                audience);
    }

    public void markSent(Instant sentAt) {
        this.sentAt = sentAt;
        this.status = ReminderStatus.SENT;
    }

    public void markFailed() {
        this.status = ReminderStatus.FAILED;
    }
}
