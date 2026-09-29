package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.verification.event.VerificationAttemptsAddedEvent;

/**
 * Tells a tenant their owner gave them more verification attempts.
 *
 * <p>The tenant who ran out was told to contact the owner. This closes that
 * loop without them having to reopen the screen to find out.
 *
 * <p>At-least-once: a repeat delivery sends the message twice, which is
 * harmless next to a tenant never learning they can try again.
 */
@Component
public class VerificationNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public VerificationNotificationEventListener(NotificationModule notificationModule, PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @ApplicationModuleListener
    public void onAttemptsAdded(VerificationAttemptsAddedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        int total = event.attemptsByService().values().stream().mapToInt(Integer::intValue).sum();
        String checks = String.join(" and ", event.attemptsByService().keySet().stream()
                .map(VerificationNotificationEventListener::label)
                .toList());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("tenancyId", event.tenancyId().toString());
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("attemptsAdded", Integer.toString(total));
        data.put("checks", checks);

        notificationModule.notifyUser(
                event.tenantUserId(),
                "You can verify again",
                property.name() + " gave you " + total + " more " + (total == 1 ? "attempt" : "attempts")
                        + " for " + checks + ". Open your tenancy to try again.",
                NotificationCategory.TENANCY,
                NotificationPriority.NORMAL,
                NotificationSubtype.VERIFICATION_ATTEMPTS_ADDED,
                event.tenancyId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                // Account-level, not TENANT: the stay is still pending, so the
                // person is not a tenant yet (owner's call, 2026-09-27).
                null);
    }

    private static String label(String serviceCode) {
        return switch (serviceCode) {
            case "AADHAAR" -> "Aadhaar verification";
            default -> "the identity check";
        };
    }
}
