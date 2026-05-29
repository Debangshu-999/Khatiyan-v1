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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "push_notifications", schema = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PushNotification extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "notification_recipient_id", nullable = false)
    private NotificationRecipient notificationRecipient;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PushNotificationStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "locked_at")
    private Instant lockedAt;

    @Column(name = "last_attempted_at")
    private Instant lastAttemptedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_attempt_provider", length = 30)
    private PushProvider lastAttemptProvider;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivered_provider", length = 30)
    private PushProvider deliveredProvider;

    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    private PushNotification(NotificationRecipient recipient, Instant now) {
        this.id = UUID.randomUUID();
        this.notificationRecipient = recipient;
        this.userId = recipient.getUserId();
        this.status = PushNotificationStatus.PENDING;
        this.nextAttemptAt = now;
    }

    public static PushNotification create(NotificationRecipient recipient, Instant now) {
        return new PushNotification(recipient, now);
    }

    public void markInProgress(Instant now) {
        this.status = PushNotificationStatus.IN_PROGRESS;
        this.lockedAt = now;
    }

    public void markAttempted(PushProvider provider, Instant now) {
        this.attemptCount = attemptCount + 1;
        this.lastAttemptProvider = provider;
        this.lastAttemptedAt = now;
    }

    public void markDelivered(PushProvider provider, Instant now) {
        this.status = PushNotificationStatus.DELIVERED;
        this.deliveredProvider = provider;
        this.deliveredAt = now;
        this.lockedAt = null;
        this.failureReason = null;
    }

    public void markRetryableFailure(String reason, Instant nextAttemptAt) {
        this.status = PushNotificationStatus.PENDING;
        this.nextAttemptAt = nextAttemptAt;
        this.lockedAt = null;
        this.failureReason = reason;
    }

    public void markFailed(String reason) {
        this.status = PushNotificationStatus.FAILED;
        this.lockedAt = null;
        this.failureReason = reason;
    }

    public void markSkippedNoDevice(Instant now) {
        this.status = PushNotificationStatus.SKIPPED_NO_DEVICE;
        this.lastAttemptedAt = now;
        this.lockedAt = null;
    }
}