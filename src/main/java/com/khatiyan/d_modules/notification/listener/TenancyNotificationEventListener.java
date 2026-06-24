package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
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
        RoomResponse room = propertyModule.getActiveRoom(event.propertyId(), event.roomId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", room.roomNumber());
        data.put("startDate", event.startDate().toString());

        notificationModule.notifyUser(
                event.userId(),
                "Tenancy started",
                "Your tenancy has started at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_STARTED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Tenancy started",
                "A tenancy has started at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_STARTED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyEnded(TenancyEndedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        RoomResponse room = propertyModule.getActiveRoom(event.propertyId(), event.roomId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", room.roomNumber());
        data.put("endDate", event.endDate().toString());

        notificationModule.notifyUser(
                event.userId(),
                "Tenancy ended",
                "Your tenancy at " + property.name() + " has ended.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ENDED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Tenancy ended",
                "A tenancy has ended at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ENDED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyRoomTransferred(TenancyRoomTransferredEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        RoomResponse newRoom = propertyModule.getActiveRoom(event.propertyId(), event.newRoomId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("oldRoomId", event.oldRoomId().toString());
        data.put("newRoomId", event.newRoomId().toString());
        data.put("newRoomNumber", newRoom.roomNumber());
        data.put("transferDate", event.transferDate().toString());

        notificationModule.notifyUser(
                event.userId(),
                "Room transferred",
                "Your room at " + property.name() + " has been changed to room " + newRoom.roomNumber() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ROOM_TRANSFERRED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Room transferred",
                "A tenant has been moved to room " + newRoom.roomNumber() + " at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ROOM_TRANSFERRED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    private Map<String, String> baseTenancyData(UUID tenancyId, UUID tenantUserId, PropertyResponse property) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("tenancyId", tenancyId.toString());
        data.put("tenantUserId", tenantUserId.toString());
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
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
