package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.event.ManagerAssignedEvent;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;

/**
 * Converts property management events into manager-facing notifications.
 */
@Component
public class PropertyNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public PropertyNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onManagerAssigned(ManagerAssignedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseManagerData(property, event.managerUserId());
        data.put("assignedByUserId", event.assignedByUserId().toString());

        notificationModule.notifyUser(
                event.managerUserId(),
                "Manager access granted",
                "You can now manage " + property.name() + ".",
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                NotificationSubtype.MANAGER_ASSIGNED,
                event.propertyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onManagerRemoved(ManagerRemovedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseManagerData(property, event.managerUserId());
        data.put("removedByUserId", event.removedByUserId().toString());

        notificationModule.notifyUser(
                event.managerUserId(),
                "Manager access removed",
                "Your manager access was removed from " + property.name() + ".",
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                NotificationSubtype.MANAGER_REMOVED,
                event.propertyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private Map<String, String> baseManagerData(PropertyResponse property, java.util.UUID managerUserId) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("managerUserId", managerUserId.toString());
        return data;
    }
}
