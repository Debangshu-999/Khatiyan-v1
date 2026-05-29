package com.khatiyan.d_modules.notification.model;

import java.util.List;
import java.util.UUID;

/**
 * Provider-neutral push payload prepared from a durable push job.
 */
public record PushNotificationCommand(
    UUID pushNotificationId,
    UUID userId,
    String title,
    String body,
    NotificationCategory category,
    NotificationPriority priority,
    UUID sourceId,  
    List<String> providerTokens
) {
}
