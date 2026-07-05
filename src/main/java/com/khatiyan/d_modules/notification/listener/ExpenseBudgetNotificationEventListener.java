package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.expense.event.BudgetDefaultUpdatedEvent;
import com.khatiyan.d_modules.expense.event.BudgetRaisedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

/**
 * Turns budget edits and raises into management-facing notifications so the
 * owner and managers get an audit trail of budget changes alongside the
 * threshold alerts. In-app only — a raise/edit is not urgent enough to push.
 */
@Component
public class ExpenseBudgetNotificationEventListener {

    private static final Locale INR = new Locale("en", "IN");

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public ExpenseBudgetNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @ApplicationModuleListener
    public void onBudgetRaised(BudgetRaisedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        Map<String, String> data = baseData(property);
        data.put("month", event.month().toString());
        data.put("raiseAmountPaise", Long.toString(event.raiseAmountPaise()));
        data.put("effectiveBudgetPaise", Long.toString(event.effectiveBudgetPaise()));
        if (event.reason() != null && !event.reason().isBlank()) {
            data.put("reason", event.reason());
        }

        String body = "%s budget raised by %s this month, now %s.".formatted(
                property.name(),
                formatPaise(event.raiseAmountPaise()),
                formatPaise(event.effectiveBudgetPaise()));

        notificationModule.notifyUsers(
                managementRecipients(property),
                "Budget raised",
                body,
                NotificationCategory.EXPENSE,
                NotificationPriority.NORMAL,
                NotificationSubtype.BUDGET_RAISED,
                event.propertyId(),
                data,
                NotificationDeliveryMode.IN_APP_ONLY,
                NotificationAudience.MANAGEMENT);
    }

    @ApplicationModuleListener
    public void onBudgetDefaultUpdated(BudgetDefaultUpdatedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        boolean firstTime = event.previousDefaultPaise() == null;

        Map<String, String> data = baseData(property);
        data.put("newDefaultPaise", Long.toString(event.newDefaultPaise()));
        if (!firstTime) {
            data.put("previousDefaultPaise", Long.toString(event.previousDefaultPaise()));
        }

        String body = firstTime
                ? "%s now has a recurring monthly budget of %s.".formatted(
                        property.name(), formatPaise(event.newDefaultPaise()))
                : "%s monthly budget changed from %s to %s.".formatted(
                        property.name(),
                        formatPaise(event.previousDefaultPaise()),
                        formatPaise(event.newDefaultPaise()));

        notificationModule.notifyUsers(
                managementRecipients(property),
                firstTime ? "Monthly budget set" : "Monthly budget updated",
                body,
                NotificationCategory.EXPENSE,
                NotificationPriority.NORMAL,
                NotificationSubtype.BUDGET_UPDATED,
                event.propertyId(),
                data,
                NotificationDeliveryMode.IN_APP_ONLY,
                NotificationAudience.MANAGEMENT);
    }

    private Map<String, String> baseData(PropertyResponse property) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        return data;
    }

    private List<UUID> managementRecipients(PropertyResponse property) {
        List<UUID> recipients = new java.util.ArrayList<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        return recipients.stream().distinct().toList();
    }

    private static String formatPaise(long paise) {
        return String.format(INR, "₹%,d", paise / 100);
    }
}
