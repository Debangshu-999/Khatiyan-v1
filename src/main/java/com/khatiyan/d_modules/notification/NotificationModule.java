package com.khatiyan.d_modules.notification;

import java.util.Collection;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.service.NotificationService;

/**
 * Facade used by other modules to create notifications.
 *
 * <p>Other modules should call this module instead of touching notification
 * repositories or push providers directly.
 */
@Component
public class NotificationModule {

    private final NotificationService notificationService;

    public NotificationModule(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode) {
        notificationService.notifyUser(userId, title, body, category, priority, sourceId, deliveryMode);
    }

    public void notifyUsers(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            UUID sourceId,
            NotificationDeliveryMode deliveryMode) {
        notificationService.notifyUsers(userIds, title, body, category, priority, sourceId, deliveryMode);
    }
}
