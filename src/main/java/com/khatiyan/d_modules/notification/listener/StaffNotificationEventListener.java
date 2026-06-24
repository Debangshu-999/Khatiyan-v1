package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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
import com.khatiyan.d_modules.staff.event.StaffMemberAddedEvent;
import com.khatiyan.d_modules.staff.event.StaffMemberEndedEvent;

/** Turns staff lifecycle events into property alerts for the management team. */
@Component
public class StaffNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public StaffNotificationEventListener(NotificationModule notificationModule, PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onStaffMemberAdded(StaffMemberAddedEvent event) {
        notifyManagement(
                event.propertyId(),
                "Staff member added",
                event.staffName() + " (" + event.categoryName() + ") was added to ",
                event.staffName(),
                event.categoryName(),
                NotificationSubtype.STAFF_ADDED);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onStaffMemberEnded(StaffMemberEndedEvent event) {
        notifyManagement(
                event.propertyId(),
                "Staff member left",
                event.staffName() + " (" + event.categoryName() + ") was removed from ",
                event.staffName(),
                event.categoryName(),
                NotificationSubtype.STAFF_REMOVED);
    }

    private void notifyManagement(
            UUID propertyId,
            String title,
            String bodyPrefix,
            String staffName,
            String categoryName,
            NotificationSubtype subtype) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(propertyId));
        if (recipients.isEmpty()) {
            return;
        }

        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("staffName", staffName);
        data.put("categoryName", categoryName);

        notificationModule.notifyUsers(
                recipients,
                title,
                bodyPrefix + property.name() + ".",
                NotificationCategory.PROPERTY,
                NotificationPriority.NORMAL,
                subtype,
                property.id(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
