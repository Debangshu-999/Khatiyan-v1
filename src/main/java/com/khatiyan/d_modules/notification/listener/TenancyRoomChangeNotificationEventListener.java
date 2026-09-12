package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeExecutionFailedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeRequestedEvent;

/**
 * Turns room-change request decisions into tenant/admin notifications.
 *
 * <p>Mirrors {@code TenancyExitNotificationEventListener}: the request goes to
 * whoever can act on it, and every decision goes back to the tenant who asked.
 * A request nobody is told about waits until someone happens to open the screen.
 *
 * <p>{@code @ApplicationModuleListener} is at-least-once, so each handler must
 * be safe to run twice. These only read the event and send a notification, which
 * carries the request id — a duplicate is a duplicate message, never a duplicate
 * room move.
 */
@Component
public class TenancyRoomChangeNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public TenancyRoomChangeNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    /** Goes to the owner and managers — they are the ones who decide it. */
    @ApplicationModuleListener
    public void onRequested(TenancyRoomChangeRequestedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseData(
                event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("currentRoomId", event.currentRoomId().toString());
        data.put("targetRoomId", event.targetRoomId().toString());
        data.put("effectiveTransferDate", event.effectiveTransferDate().toString());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Room change requested",
                "A tenant asked to move rooms from " + event.effectiveTransferDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_ROOM_CHANGE_REQUESTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onApproved(TenancyRoomChangeApprovedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseData(
                event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("targetRoomId", event.targetRoomId().toString());
        data.put("effectiveTransferDate", event.effectiveTransferDate().toString());

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Room change approved",
                "Your room change is approved and will take effect on " + event.effectiveTransferDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_ROOM_CHANGE_APPROVED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onRejected(TenancyRoomChangeRejectedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseData(
                event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        if (event.reason() != null && !event.reason().isBlank()) {
            data.put("reason", event.reason().trim());
        }

        // The reason travels in the message, not just the payload: a rejection a
        // tenant cannot explain to themselves produces a second identical request.
        String reason = event.reason() != null && !event.reason().isBlank()
                ? " Reason: " + event.reason().trim()
                : "";

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Room change rejected",
                "Your room change request was not approved." + reason,
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_ROOM_CHANGE_REJECTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    /** Both sides: the tenant has moved, and the rent on record may have changed. */
    @ApplicationModuleListener
    public void onExecuted(TenancyRoomChangeExecutedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseData(
                event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("targetRoomId", event.targetRoomId().toString());
        data.put("newRentAmountPaise", String.valueOf(event.newRentAmountPaise()));

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Room change complete",
                "You have been moved to your new room. Your rent from the next cycle is "
                        + rupees(event.newRentAmountPaise()) + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ROOM_CHANGE_EXECUTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Room change complete",
                "A tenant has been moved to their new room.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_ROOM_CHANGE_EXECUTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_ONLY);
    }

    /**
     * A scheduled move could not run, so it is cancelled and its bed released.
     *
     * <p>
     * Told to everyone it concerns, once. The tenant learns the move is off and
     * that they can ask again. Management gets the reason, since it is theirs to
     * look into.
     */
    @ApplicationModuleListener
    public void onExecutionFailed(TenancyRoomChangeExecutionFailedEvent event) {
        PropertyResponse property = activePropertyOrNull(event.propertyId());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("requestId", event.requestId().toString());
        data.put("referenceCode", event.requestReferenceCode());
        data.put("tenancyId", event.tenancyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("propertyId", event.propertyId().toString());
        if (property != null) {
            data.put("propertyName", property.name());
        }
        data.put("targetRoomId", event.targetRoomId().toString());
        data.put("effectiveTransferDate", event.effectiveTransferDate().toString());

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Room change not completed",
                "Your room change planned for " + event.effectiveTransferDate()
                        + " could not be completed, so it has been cancelled. You can raise a new request if you"
                        + " still want to move.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_ROOM_CHANGE_EXECUTION_FAILED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);

        if (property == null) {
            return;
        }

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Room change cancelled",
                "Room change " + event.requestReferenceCode() + " due on " + event.effectiveTransferDate()
                        + " could not be completed and has been cancelled. " + sentence(event.reason())
                        + " The reserved bed has been released.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_ROOM_CHANGE_EXECUTION_FAILED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    private PropertyResponse activePropertyOrNull(java.util.UUID propertyId) {
        try {
            return propertyModule.getActiveProperty(propertyId);
        } catch (NotFoundException exception) {
            return null;
        }
    }

    /** One sentence, ending in exactly one full stop, whatever the source ended in. */
    private static String sentence(String text) {
        String trimmed = text == null ? "" : text.trim();
        return trimmed.endsWith(".") ? trimmed : trimmed + ".";
    }

    private Map<String, String> baseData(
            UUID requestId,
            String requestReferenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            PropertyResponse property) {
        Map<String, String> data = new LinkedHashMap<>();
        // The id is kept for deep-linking; the CODE is what any UI shows. A feed
        // row printing eight characters of a UUID is unreadable and unsearchable.
        data.put("requestId", requestId.toString());
        data.put("referenceCode", requestReferenceCode);
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

    private static String rupees(long paise) {
        return "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale.forLanguageTag("en-IN"))
                .format(paise / 100);
    }
}
