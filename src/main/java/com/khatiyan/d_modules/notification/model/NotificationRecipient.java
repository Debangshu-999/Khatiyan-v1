package com.khatiyan.d_modules.notification.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "notification_recipients", schema = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationRecipient extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "notification_id", nullable = false)
    private Notification notification;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /**
     * Workspace this recipient row belongs to (tenant vs management). Null means
     * "show in either workspace" — account-level notifications and legacy rows.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "audience", length = 20)
    private NotificationAudience audience;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    private NotificationRecipient(Notification notification, UUID userId, NotificationAudience audience) {
        this.id = UUID.randomUUID();
        this.notification = notification;
        this.userId = userId;
        this.audience = audience;
    }

    public static NotificationRecipient create(Notification notification, UUID userId) {
        return new NotificationRecipient(notification, userId, null);
    }

    public static NotificationRecipient create(Notification notification, UUID userId, NotificationAudience audience) {
        return new NotificationRecipient(notification, userId, audience);
    }

    public void markRead(Instant now) {
        if (readAt == null) {
            this.readAt = now;
        }
    }

    public void archive(Instant now) {
        if (archivedAt == null) {
            this.archivedAt = now;
        }
    }
}
