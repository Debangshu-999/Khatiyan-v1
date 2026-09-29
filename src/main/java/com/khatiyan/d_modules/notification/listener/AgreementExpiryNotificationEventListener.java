package com.khatiyan.d_modules.notification.listener;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(AgreementExpiryNotificationEventListener.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;
    private final Clock clock;

    public AgreementExpiryNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule,
            Clock clock) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
        this.clock = clock;
    }

    @ApplicationModuleListener
    public void onAgreementExpiryApproaching(AgreementExpiryApproachingEvent event) {
        LocalDate today = LocalDate.now(clock.withZone(IST));
        if (isStale(event, today)) {
            // Delivered on a later day than it was written for: a failed event
            // re-sent after an outage (seen 2026-09-27, when "ends in 2 days"
            // and "ends in 1 day" landed together). Its count is wrong now, and
            // a newer run has already sent the right one.
            log.info("Stale agreement expiry reminder dropped tenancyId={} daysRemaining={} today={}",
                    event.tenancyId(), event.daysRemaining(), today);
            return;
        }
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

    /** Whether the count the event carries is no longer true on this day. */
    static boolean isStale(AgreementExpiryApproachingEvent event, LocalDate today) {
        return ChronoUnit.DAYS.between(today, event.agreementEndDate()) != event.daysRemaining();
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
