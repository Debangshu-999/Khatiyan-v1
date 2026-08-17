package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyExitApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExpiredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRequestedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitWithdrawalDecidedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitWithdrawalRequestedEvent;

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

    @ApplicationModuleListener
    public void onTenancyExitRequested(TenancyExitRequestedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("exitType", event.type().name());
        data.put("requestedCheckoutDate", event.requestedCheckoutDate().toString());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Tenancy exit requested",
                "A tenant requested a " + event.type().name().toLowerCase() + " exit for " + event.requestedCheckoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_REQUESTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitApproved(TenancyExitApprovedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("approvedCheckoutDate", event.approvedCheckoutDate().toString());

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Exit request approved",
                "Your tenancy exit request was approved for " + event.approvedCheckoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_APPROVED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitRejected(TenancyExitRejectedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Exit request rejected",
                "Your tenancy exit request was rejected by management.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_REJECTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitCancelled(TenancyExitCancelledEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("exitType", event.type().name());

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Exit request cancelled",
                "A tenant cancelled their " + event.type().name().toLowerCase() + " exit request.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_EXIT_CANCELLED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitExecuted(TenancyExitExecutedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("checkoutDate", event.checkoutDate().toString());

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Tenancy exit completed",
                "Your tenancy exit was completed for " + event.checkoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.TENANCY_EXIT_EXECUTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    /**
     * A request lapsed unreviewed.
     *
     * <p>Told to both sides. The tenant needs to know their request went
     * unanswered and that they may raise it again without losing notice time;
     * the owner needs to know they let it lapse, which is a management failure
     * worth surfacing rather than burying.
     */
    @ApplicationModuleListener
    public void onTenancyExitExpired(TenancyExitExpiredEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("exitType", event.type().name());

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Exit request expired",
                "Nobody reviewed your exit request in time, so it lapsed. You can raise it again — your notice"
                        + " period still counts from the day you first asked.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_EXPIRED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Exit request expired unreviewed",
                "A tenant's exit request lapsed because it was not reviewed in time.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_EXPIRED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitWithdrawalRequested(TenancyExitWithdrawalRequestedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("exitType", event.type().name());
        if (event.approvedCheckoutDate() != null) {
            data.put("approvedCheckoutDate", event.approvedCheckoutDate().toString());
        }

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Exit withdrawal requested",
                "A tenant asked to cancel their approved exit of " + event.approvedCheckoutDate()
                        + " and stay on. This needs your decision.",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.TENANCY_EXIT_WITHDRAWAL_REQUESTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onTenancyExitWithdrawalDecided(TenancyExitWithdrawalDecidedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        Map<String, String> data = baseExitData(event.requestId(), event.requestReferenceCode(), event.tenancyId(), event.tenantUserId(), property);
        data.put("exitType", event.type().name());
        data.put("withdrawalApproved", Boolean.toString(event.approved()));
        if (event.approvedCheckoutDate() != null) {
            data.put("approvedCheckoutDate", event.approvedCheckoutDate().toString());
        }

        notificationModule.notifyUser(
                event.tenantUserId(),
                event.approved() ? "You are staying on" : "Your exit still stands",
                event.approved()
                        ? "Your exit was cancelled and your tenancy continues as normal."
                        : "Management did not agree to cancel your exit. Your last day is still "
                                + event.approvedCheckoutDate() + ".",
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                event.approved()
                        ? NotificationSubtype.TENANCY_EXIT_WITHDRAWAL_APPROVED
                        : NotificationSubtype.TENANCY_EXIT_WITHDRAWAL_REJECTED,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private Map<String, String> baseExitData(
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
}
