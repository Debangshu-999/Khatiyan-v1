package com.khatiyan.d_modules.notification;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.notification.service.NotificationService;

/**
 * Facade used by other modules to create notifications.
 *
 * <p>Other modules should call this module instead of touching notification
 * repositories or push providers directly.
 *
 * <p>Two overload families:
 * <ul>
 *   <li>Legacy: {@code notifyUser/notifyUsers(... sourceId, deliveryMode)} —
 *       no subtype, no structured data. Kept for callers that haven't been
 *       upgraded yet (currently the reminder pipeline).</li>
 *   <li>Structured: {@code notifyUser/notifyUsers(... subtype, sourceId,
 *       data, deliveryMode)} — used by event listeners that can supply a
 *       specific {@link NotificationSubtype} and a {@code Map<String,String>}
 *       of references the UI uses to render context and navigate.</li>
 * </ul>
 */
@Component
public class NotificationModule {

    private final NotificationService notificationService;

    public NotificationModule(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    // Legacy overloads — no subtype, no data.

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

    // Structured overloads with subtype + data payload.

    public void notifyUser(
            UUID userId,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode) {
        notificationService.notifyUser(userId, title, body, category, priority, subtype, sourceId, data, deliveryMode);
    }

    public void notifyUsers(
            Collection<UUID> userIds,
            String title,
            String body,
            NotificationCategory category,
            NotificationPriority priority,
            NotificationSubtype subtype,
            UUID sourceId,
            Map<String, String> data,
            NotificationDeliveryMode deliveryMode) {
        notificationService.notifyUsers(userIds, title, body, category, priority, subtype, sourceId, data, deliveryMode);
    }
}
