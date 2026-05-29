package com.khatiyan.d_modules.notification.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

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
 * User-facing in-app notification content.
 *
 * <p>This powers the notification tab. The category tells the broad module
 * bucket, and sourceId points to the object the UI should open.
 */
@Entity
@Table(name = "notifications", schema = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 2000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private NotificationCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationPriority priority;

    @Column(name = "source_id")
    private UUID sourceId;

    private Notification(String title, String body, NotificationCategory category,
                         NotificationPriority priority, UUID sourceId) {
        this.id = UUID.randomUUID();
        this.title = title;
        this.body = body;
        this.category = category;
        this.priority = priority;
        this.sourceId = sourceId;
    }

    public static Notification create(String title, String body, NotificationCategory category,
                                      NotificationPriority priority, UUID sourceId) {
        return new Notification(title, body, category, priority, sourceId);
    }
}