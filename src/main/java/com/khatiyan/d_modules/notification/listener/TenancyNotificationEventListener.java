package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;

/**
 * Converts committed tenancy lifecycle events into user-facing notifications.
 */
@Component
public class TenancyNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public TenancyNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyStarted(TenancyStartedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        notificationModule.notifyUser(
                event.userId(),
                "Tenancy started",
                "Your tenancy has started at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());

        List<UUID> adminRecipients = adminRecipients(property);
        notificationModule.notifyUsers(
                adminRecipients,
                "Tenancy started",
                "A tenancy has started at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyEnded(TenancyEndedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        notificationModule.notifyUser(
                event.userId(),
                "Tenancy ended",
                "Your tenancy at " + property.name() + " has ended.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());

        List<UUID> adminRecipients = adminRecipients(property);
        notificationModule.notifyUsers(
                adminRecipients,
                "Tenancy ended",
                "A tenancy has ended at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyRoomTransferred(TenancyRoomTransferredEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        RoomResponse newRoom = propertyModule.getActiveRoom(event.propertyId(), event.newRoomId());

        notificationModule.notifyUser(
                event.userId(),
                "Room transferred",
                "Your room at " + property.name() + " has been changed to room " + newRoom.roomNumber() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());

        List<UUID> adminRecipients = adminRecipients(property);
        notificationModule.notifyUsers(
                adminRecipients,
                "Room transferred",
                "A tenant has been moved to room " + newRoom.roomNumber() + " at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.tenancyId());
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
