package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyExitApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRequestedEvent;

/**
 * Converts tenancy-exit request decisions into tenant/admin notifications.
 */
@Component
public class TenancyExitNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public TenancyExitNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyExitRequested(TenancyExitRequestedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Tenancy exit requested",
                "A tenant requested a " + event.type().name().toLowerCase() + " exit for " + event.requestedCheckoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                event.requestId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyExitApproved(TenancyExitApprovedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Exit request approved",
                "Your tenancy exit request was approved for " + event.approvedCheckoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                event.requestId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyExitRejected(TenancyExitRejectedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Exit request rejected",
                "Your tenancy exit request was rejected by management.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                event.requestId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyExitCancelled(TenancyExitCancelledEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Exit request cancelled",
                "A tenant cancelled their " + event.type().name().toLowerCase() + " exit request.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.requestId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTenancyExitExecuted(TenancyExitExecutedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Tenancy exit completed",
                "Your tenancy exit was completed for " + event.checkoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                event.requestId(),
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
