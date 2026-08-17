package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.event.AgreementExpiryApproachingEvent;

/**
 * Turns agreement run-up milestones into notifications for both sides.
 *
 * <p>The copy says plainly that the tenancy ends. It used to promise the
 * opposite — that the stay carried on — which was true while an agreement was a
 * lapsing document rather than the tenancy's own term. Under a fixed term that
 * reassurance would be a lie told to someone who then failed to find a room.
 *
 * <p>What it must not do is imply eviction. The end date was agreed by both
 * sides when the tenancy started; this is a reminder of a plan, not a notice.
 */
@Component
public class AgreementExpiryNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public AgreementExpiryNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @ApplicationModuleListener
    public void onAgreementExpiryApproaching(AgreementExpiryApproachingEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("tenancyId", event.tenancyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("agreementEndDate", event.agreementEndDate().toString());
        data.put("daysRemaining", Integer.toString(event.daysRemaining()));

        // Escalates as the date nears: a month out is information, the last few
        // days are something to act on.
        NotificationPriority priority = event.daysRemaining() <= 3
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL;

        notificationModule.notifyUser(
                event.tenantUserId(),
                tenantTitle(event.daysRemaining()),
                tenantBody(event),
                NotificationCategory.TENANCY,
                priority,
                NotificationSubtype.TENANCY_AGREEMENT_EXPIRY_APPROACHING,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);

        notificationModule.notifyUsers(
                adminRecipients(property),
                event.daysRemaining() == 0
                        ? "A tenant's agreement ends today"
                        : "A tenant's agreement ends in " + describeRemaining(event.daysRemaining()),
                "The agreement ends on " + event.agreementEndDate()
                        + ", and the tenancy with it. End the tenancy on the day to settle"
                        + " damages, the checklist and the deposit.",
                NotificationCategory.TENANCY,
                priority,
                NotificationSubtype.TENANCY_AGREEMENT_EXPIRY_APPROACHING,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private String tenantTitle(int daysRemaining) {
        return daysRemaining == 0
                ? "Your agreement ends today"
                : "Your agreement ends in " + describeRemaining(daysRemaining);
    }

    private String tenantBody(AgreementExpiryApproachingEvent event) {
        // Says the thing that matters — you will need somewhere to go — without
        // sounding like an eviction. Both sides agreed this date at the start.
        return "Your agreement ends on " + event.agreementEndDate()
                + ", and your tenancy ends with it. Please plan your move-out for that day."
                + " Speak to your property manager if you would like to stay on.";
    }

    private String describeRemaining(int daysRemaining) {
        return daysRemaining == 1 ? "1 day" : daysRemaining + " days";
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
