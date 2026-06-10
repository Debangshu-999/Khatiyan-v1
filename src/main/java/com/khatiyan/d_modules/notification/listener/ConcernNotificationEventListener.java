package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernReopenedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernResolvedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernStatusChangedEvent;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

/**
 * Converts committed concern lifecycle events into user-facing notifications.
 */
@Component
public class ConcernNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public ConcernNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernRaised(ConcernRaisedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseConcernData(event.concernId(), property, event.title());
        data.put("raisedByUserId", event.raisedByUserId().toString());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "New concern raised",
                "A tenant raised a concern: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                NotificationSubtype.CONCERN_RAISED,
                event.concernId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernAssigned(ConcernAssignedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseConcernData(event.concernId(), property, event.title());
        data.put("assignedToUserId", event.assignedToUserId().toString());

        notificationModule.notifyUser(
                event.assignedToUserId(),
                "Concern assigned",
                "A concern has been assigned to you: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                NotificationSubtype.CONCERN_ASSIGNED,
                event.concernId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernStatusChanged(ConcernStatusChangedEvent event) {
        if (event.status() != ConcernStatus.IN_PROGRESS) {
            return;
        }

        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseConcernData(event.concernId(), property, event.title());
        data.put("raisedByUserId", event.raisedByUserId().toString());
        if (event.assignedToUserId() != null) {
            data.put("assignedToUserId", event.assignedToUserId().toString());
        }
        data.put("status", event.status().name());

        notificationModule.notifyUser(
                event.raisedByUserId(),
                "Concern in progress",
                "Your concern is now in progress: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                NotificationSubtype.CONCERN_IN_PROGRESS,
                event.concernId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernResolved(ConcernResolvedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseConcernData(event.concernId(), property, event.title());
        data.put("raisedByUserId", event.raisedByUserId().toString());
        data.put("resolvedByUserId", event.resolvedByUserId().toString());

        notificationModule.notifyUser(
                event.raisedByUserId(),
                "Concern resolved",
                "Your concern was marked resolved: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                NotificationSubtype.CONCERN_RESOLVED,
                event.concernId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernReopened(ConcernReopenedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseConcernData(event.concernId(), property, event.title());
        data.put("raisedByUserId", event.raisedByUserId().toString());
        data.put("assignedToUserId", event.assignedToUserId().toString());

        List<UUID> recipients = new ArrayList<>(adminRecipients(property));
        recipients.add(event.assignedToUserId());

        notificationModule.notifyUsers(
                recipients.stream().distinct().toList(),
                "Concern reopened",
                "A resolved concern was reopened: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.HIGH,
                NotificationSubtype.CONCERN_REOPENED,
                event.concernId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private Map<String, String> baseConcernData(UUID concernId, PropertyResponse property, String concernTitle) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("concernId", concernId.toString());
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        if (concernTitle != null) {
            data.put("concernTitle", concernTitle);
        }
        return data;
    }

    private List<UUID> adminRecipients(PropertyResponse property) {
        List<UUID> recipients = new ArrayList<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        return recipients.stream()
                .distinct()
                .toList();
    }
}
