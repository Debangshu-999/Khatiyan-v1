package com.khatiyan.d_modules.notification.api.dto;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.notification.model.Notification;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationRecipient;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * User-facing notification item shown in the in-app notification tab.
 *
 * <p>The {@code subtype} tells the frontend which screen to deep-link to
 * when the row is tapped, and {@code data} carries the structured references
 * needed to build that link (e.g. {@code propertyId}, {@code concernId},
 * {@code roomNumber}). Both are populated for notifications produced by the
 * event listeners; reminder-driven notifications still come through with
 * subtype null and an empty data map.
 */
public record NotificationResponse(
    UUID recipientId,
    UUID notificationId,
    String title,
    String body,
    NotificationCategory category,
    NotificationPriority priority,
    NotificationSubtype subtype,
    UUID sourceId,
    Map<String, String> data,
    Instant readAt,
    Instant archivedAt,
    Instant createdAt
) {

    public static NotificationResponse from(NotificationRecipient recipient) {
        Notification notification = recipient.getNotification();
        Map<String, String> data = notification.getData() != null
            ? new LinkedHashMap<>(notification.getData())
            : new LinkedHashMap<>();

        return new NotificationResponse(
            recipient.getId(),
            notification.getId(),
            notification.getTitle(),
            notification.getBody(),
            notification.getCategory(),
            notification.getPriority(),
            notification.getSubtype(),
            notification.getSourceId(),
            data,
            recipient.getReadAt(),
            recipient.getArchivedAt(),
            recipient.getCreatedAt()
        );
    }
}
