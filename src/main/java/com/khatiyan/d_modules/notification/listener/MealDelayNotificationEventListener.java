package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.food.event.MealDelayedEvent;
import com.khatiyan.d_modules.food.service.MealScheduleRules;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * Tells every tenant on a meal plan that one of today's meals moved.
 *
 * <p>At-least-once: a repeat delivery sends the message twice, which is
 * harmless next to a tenant turning up at the old time.
 */
@Component
public class MealDelayNotificationEventListener {

    private final NotificationModule notificationModule;

    public MealDelayNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @ApplicationModuleListener
    public void onMealDelayed(MealDelayedEvent event) {
        String meal = MealScheduleRules.label(event.mealType());
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", event.propertyName());
        data.put("mealType", event.mealType().name());
        data.put("mealDate", event.mealDate().toString());
        data.put("startTime", event.newStartTime().toString());
        data.put("endTime", event.newEndTime().toString());
        data.put("delayMinutes", Integer.toString(event.delayMinutes()));

        String body = meal + " at " + event.propertyName() + " now starts at "
                + MealScheduleRules.clock(event.newStartTime()) + ", " + event.delayMinutes()
                + " min later than planned.";
        for (UUID tenantUserId : event.tenantUserIds()) {
            notificationModule.notifyUser(
                    tenantUserId,
                    meal + " is delayed",
                    body,
                    NotificationCategory.NOTICE,
                    NotificationPriority.NORMAL,
                    NotificationSubtype.FOOD_MEAL_DELAYED,
                    event.propertyId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);
        }
    }
}
