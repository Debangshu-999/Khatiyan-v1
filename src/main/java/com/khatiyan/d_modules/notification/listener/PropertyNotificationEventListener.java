package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.event.ManagerAssignedEvent;
import com.khatiyan.d_modules.property.event.ManagerEmploymentUpdatedEvent;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;
import com.khatiyan.d_modules.property.event.RoomLifecycleEvent;

/**
 * Converts property management events into manager- and management-facing
 * notifications.
 */
@Component
public class PropertyNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;

    public PropertyNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule,
            AuthModule authModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
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

        // Property alert to the rest of the management team.
        Set<UUID> management = managementRecipients(event.propertyId(), property.ownerId(), event.managerUserId());
        if (!management.isEmpty()) {
            notificationModule.notifyUsers(
                    management,
                    "New manager added",
                    managerName(event.managerUserId()) + " was added as a manager of " + property.name() + ".",
                    NotificationCategory.PROPERTY,
                    NotificationPriority.NORMAL,
                    NotificationSubtype.MANAGER_ASSIGNED,
                    event.propertyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH);
        }
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

        // Property alert to the rest of the management team.
        Set<UUID> management = managementRecipients(event.propertyId(), property.ownerId(), event.managerUserId());
        if (!management.isEmpty()) {
            notificationModule.notifyUsers(
                    management,
                    "Manager removed",
                    managerName(event.managerUserId()) + " was removed as a manager of " + property.name() + ".",
                    NotificationCategory.PROPERTY,
                    NotificationPriority.NORMAL,
                    NotificationSubtype.MANAGER_REMOVED,
                    event.propertyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onManagerEmploymentUpdated(ManagerEmploymentUpdatedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseManagerData(property, event.managerUserId());

        // Personal, account-level alert to the affected manager.
        notificationModule.notifyUser(
                event.managerUserId(),
                "Employment details updated",
                "Your employment details for " + property.name() + " were updated by the owner.",
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                NotificationSubtype.MANAGER_EMPLOYMENT_UPDATED,
                event.propertyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRoomLifecycle(RoomLifecycleEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        // Alert the whole management team (owner + active managers), including
        // the person who performed the action so it shows on their alert screen
        // and serves as a record.
        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(event.propertyId()));
        if (recipients.isEmpty()) {
            return;
        }

        String roomLabel = "Room " + event.roomNumber();
        String title;
        String body;
        NotificationSubtype subtype;

        switch (event.kind()) {
            case MAINTENANCE_STARTED -> {
                subtype = NotificationSubtype.ROOM_MAINTENANCE_STARTED;
                title = roomLabel + " under maintenance";
                body = event.reason() != null && !event.reason().isBlank()
                        ? roomLabel + " at " + property.name() + " was put under maintenance: " + event.reason()
                        : roomLabel + " at " + property.name() + " was put under maintenance.";
            }
            case MAINTENANCE_ENDED -> {
                subtype = NotificationSubtype.ROOM_MAINTENANCE_ENDED;
                title = roomLabel + " back in service";
                body = roomLabel + " at " + property.name() + " was taken off maintenance.";
            }
            case DEACTIVATED -> {
                subtype = NotificationSubtype.ROOM_DEACTIVATED;
                title = roomLabel + " deactivated";
                body = roomLabel + " at " + property.name() + " was deactivated.";
            }
            case REACTIVATED -> {
                subtype = NotificationSubtype.ROOM_REACTIVATED;
                title = roomLabel + " reactivated";
                body = roomLabel + " at " + property.name() + " is active again.";
            }
            default -> {
                return;
            }
        }

        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", event.roomNumber());
        if (event.reason() != null && !event.reason().isBlank()) {
            data.put("reason", event.reason());
        }

        notificationModule.notifyUsers(
                recipients,
                title,
                body,
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                subtype,
                event.roomId(),
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

    private Set<UUID> managementRecipients(UUID propertyId, UUID ownerId, UUID excludeUserId) {
        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(ownerId);
        recipients.addAll(propertyModule.findActiveManagerUserIds(propertyId));
        if (excludeUserId != null) {
            recipients.remove(excludeUserId);
        }
        return recipients;
    }

    private String managerName(UUID managerUserId) {
        return authModule.findById(managerUserId)
                .map(user -> user.fullName())
                .filter(name -> name != null && !name.isBlank())
                .orElse("A manager");
    }
}
