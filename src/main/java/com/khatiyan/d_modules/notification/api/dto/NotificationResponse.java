package com.khatiyan.d_modules.notification.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.notification.model.Notification;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationRecipient;

/**
 * User-facing notification item shown in the in-app notification tab.
 */
public record NotificationResponse(
    UUID recipientId,
    UUID notificationId,
    String title,
    String body,
    NotificationCategory category,
    NotificationPriority priority,
    UUID sourceId,
    Instant readAt,
    Instant archivedAt,
    Instant createdAt
) {

    public static NotificationResponse from(NotificationRecipient recipient) {
        Notification notification = recipient.getNotification();

        return new NotificationResponse(
            recipient.getId(),
            notification.getId(),
            notification.getTitle(),
            notification.getBody(),
            notification.getCategory(),
            notification.getPriority(),
            notification.getSourceId(),
            recipient.getReadAt(),
            recipient.getArchivedAt(),
            recipient.getCreatedAt()
        );
    }
}
