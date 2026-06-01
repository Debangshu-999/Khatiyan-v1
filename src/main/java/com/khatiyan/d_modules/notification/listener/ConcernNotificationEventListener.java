package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.List;
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

        notificationModule.notifyUsers(
                adminRecipients(property),
                "New concern raised",
                "A tenant raised a concern: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                event.concernId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernAssigned(ConcernAssignedEvent event) {
        notificationModule.notifyUser(
                event.assignedToUserId(),
                "Concern assigned",
                "A concern has been assigned to you: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                event.concernId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernStatusChanged(ConcernStatusChangedEvent event) {
        if (event.status() != ConcernStatus.IN_PROGRESS) {
            return;
        }

        notificationModule.notifyUser(
                event.raisedByUserId(),
                "Concern in progress",
                "Your concern is now in progress: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                event.concernId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernResolved(ConcernResolvedEvent event) {
        notificationModule.notifyUser(
                event.raisedByUserId(),
                "Concern resolved",
                "Your concern was marked resolved: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.NORMAL,
                event.concernId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcernReopened(ConcernReopenedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        List<UUID> recipients = new ArrayList<>(adminRecipients(property));
        recipients.add(event.assignedToUserId());

        notificationModule.notifyUsers(
                recipients.stream().distinct().toList(),
                "Concern reopened",
                "A resolved concern was reopened: " + event.title(),
                NotificationCategory.CONCERN,
                NotificationPriority.HIGH,
                event.concernId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
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
