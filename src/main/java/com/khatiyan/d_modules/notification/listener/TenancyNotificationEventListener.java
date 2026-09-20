package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

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
import com.khatiyan.d_modules.tenancy.event.TenancyCancellationRoute;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyActivatedEvent;
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

    @ApplicationModuleListener
    public void onTenancyStarted(TenancyStartedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        RoomResponse room = propertyModule.getActiveRoom(event.propertyId(), event.roomId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", room.roomNumber());
        data.put("startDate", event.startDate().toString());

        // A daily guest has no account, so there is nobody to tell. Skipping is
        // the correct outcome and not a gap: the stay is management-side by
        // design, and the owner is still told below.
        // A tenancy waiting on a signature has NOT started, and saying so to
        // the person who has not signed yet is worse than saying nothing: it
        // tells them the thing they still have to do is already done.
        boolean waiting = event.pendingAcceptance();
        NotificationSubtype subtype =
                waiting ? NotificationSubtype.TENANT_ONBOARDED : NotificationSubtype.TENANCY_STARTED;

        if (event.userId() != null) {
            notificationModule.notifyUser(
                    event.userId(),
                    waiting ? "You have been onboarded" : "Tenancy started",
                    waiting
                            ? "You have been added at " + property.name()
                                    + ". Read and sign your agreement to begin your tenancy."
                            : "Your tenancy has started at " + property.name() + ".",
                    NotificationCategory.TENANCY,
                    NotificationPriority.NORMAL,
                    subtype,
                    event.tenancyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);
        }

        notificationModule.notifyUsers(
                adminRecipients(property),
                waiting ? "Tenant onboarded" : "Tenancy started",
                waiting
                        ? "A tenant has been onboarded at " + property.name()
                                + ", waiting for them to sign."
                        : "A tenancy has started at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                subtype,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    /**
     * They signed, so the tenancy has actually started.
     *
     * <p>The second of the two moments a monthly tenancy has. The first told
     * everybody somebody had been onboarded; this one is the tenancy itself
     * beginning, with billing alongside it.
     */
    @ApplicationModuleListener
    public void onTenancyActivated(TenancyActivatedEvent event) {
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
                "A tenant has signed their agreement at " + property.name() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_STARTED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    @ApplicationModuleListener
    public void onTenancyEnded(TenancyEndedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        RoomResponse room = propertyModule.getActiveRoom(event.propertyId(), event.roomId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", room.roomNumber());
        data.put("endDate", event.endDate().toString());

        // Guarded exactly as the started listener is. This one was missed, so
        // ending a guest stay handed a null recipient to notifyUser — and being
        // an async module listener it failed AFTER the commit, leaving a stuck
        // event_publication row and no notification to anyone, including the
        // owner notified below.
        if (event.userId() != null) {
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
        }

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

    @ApplicationModuleListener
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

    /**
     * A pending tenancy cancelled before it ever began.
     *
     * <p>
     * <b>Told to whoever did not do it.</b> All three routes leave the other
     * side with a tenancy that has quietly disappeared: an owner who onboarded
     * someone yesterday, or a tenant who accepted a room and was waiting to move
     * in. Until this listener existed nobody was told at all, and the first
     * anyone knew was a bed that had come free or an agreement that no longer
     * opened.
     *
     * <p>
     * <b>The route is in the sentence, not just the payload.</b> "Your tenancy
     * was cancelled" fits all three and misleads in two of them. An expiry read
     * as a cancellation invites the owner to blame the tenant for something
     * nobody did, and a withdrawal read as a decline blames the tenant for the
     * owner's own decision.
     *
     * <p>
     * The actor is skipped. Somebody who has just declined an agreement is
     * looking at the screen that says so, and a push telling them what they did
     * a second ago reads as the app not having noticed.
     */
    @ApplicationModuleListener
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseTenancyData(event.tenancyId(), event.userId(), property);
        data.put("route", event.route().name());
        data.put("cancelledBy", cancelledBy(event.route()));
        if (event.reason() != null && !event.reason().isBlank()) {
            data.put("reason", event.reason().trim());
        }

        // Absent on a guest stay, which has no account to notify.
        boolean tenantActed = event.actorUserId() != null && event.actorUserId().equals(event.userId());
        if (event.userId() != null && !tenantActed) {
            notificationModule.notifyUser(
                    event.userId(),
                    "Tenancy cancelled",
                    tenantMessage(event.route(), property.name()),
                    NotificationCategory.TENANCY,
                    // HIGH: the reader was expecting to move in. This is not
                    // something to find later in a feed.
                    NotificationPriority.HIGH,
                    NotificationSubtype.TENANCY_CANCELLED,
                    event.tenancyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);
        }

        // The whole management side, minus whoever withdrew it. The others are
        // working the same room list and a bed has just come back.
        List<UUID> admins = adminRecipients(property).stream()
                .filter(recipient -> !recipient.equals(event.actorUserId()))
                .toList();
        if (!admins.isEmpty()) {
            notificationModule.notifyUsers(
                    admins,
                    "Tenancy cancelled",
                    adminMessage(event.route(), property.name()),
                    NotificationCategory.TENANCY,
                    NotificationPriority.HIGH,
                    NotificationSubtype.TENANCY_CANCELLED,
                    event.tenancyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.MANAGEMENT);
        }
    }

    /** What the tenant is told, which turns entirely on who did it. */
    private String tenantMessage(TenancyCancellationRoute route, String propertyName) {
        return switch (route) {
            case MANAGEMENT_WITHDREW ->
                    "Your pending tenancy at " + propertyName + " was withdrawn by the property. Nothing was charged.";
            case ACCEPTANCE_EXPIRED ->
                    "Your offer at " + propertyName + " expired before it was accepted. The room is open to others again.";
            // Reachable only for a tenancy the tenant did not personally decline
            // — an owner account declining on their behalf, say. The plain
            // wording is the honest one there.
            case TENANT_DECLINED ->
                    "Your pending tenancy at " + propertyName + " was cancelled. Nothing was charged.";
        };
    }

    /** And what management is told, for the same reason. */
    private String adminMessage(TenancyCancellationRoute route, String propertyName) {
        return switch (route) {
            case TENANT_DECLINED ->
                    "A tenant declined their agreement at " + propertyName + ". The bed is free again.";
            case ACCEPTANCE_EXPIRED ->
                    "An offer at " + propertyName + " expired before it was accepted. The bed is free again.";
            case MANAGEMENT_WITHDREW ->
                    "A pending tenancy at " + propertyName + " was withdrawn. The bed is free again.";
        };
    }

    /** The route as a line a feed row can print without translating an enum. */
    private String cancelledBy(TenancyCancellationRoute route) {
        return switch (route) {
            case TENANT_DECLINED -> "Tenant declined";
            case MANAGEMENT_WITHDREW -> "Withdrawn by property";
            case ACCEPTANCE_EXPIRED -> "Offer expired";
        };
    }

    private Map<String, String> baseTenancyData(UUID tenancyId, UUID tenantUserId, PropertyResponse property) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("tenancyId", tenancyId.toString());
        // Absent on a guest stay, which has no account. Omitted rather than
        // written as "null", because a client reading this map wants to know
        // there is no tenant to open, not to be handed the string.
        if (tenantUserId != null) {
            data.put("tenantUserId", tenantUserId.toString());
        }
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
