package com.khatiyan.d_modules.notification.listener;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.food.service.MealScheduleRules;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.tenancy.event.StayOutChangedEvent;

/**
 * Tells the owner and managers when a tenant declares, changes or cancels a
 * stay out (user, 2026-11-08). In the app only: the meal forecast and roster
 * already account for it, so nobody needs a buzz.
 */
@Component
public class StayOutNotificationEventListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public StayOutNotificationEventListener(NotificationModule notificationModule, PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    @ApplicationModuleListener
    public void onStayOutChanged(StayOutChangedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());
        String name = event.tenantName() == null || event.tenantName().isBlank() ? "A tenant" : event.tenantName();
        String dates = "from " + day(event.leaveDate()) + " to " + day(event.returnDate());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        data.put("tenantName", name);
        data.put("leaveDate", event.leaveDate().toString());
        data.put("returnDate", event.returnDate().toString());
        // The card's table (user, 2026-11-09): when, from which meal to which, and why.
        List<MealType> served = served(property);
        data.put("leaving", withMeal(event.leaveDate(), event.lastMealHere() == null
                ? (served.isEmpty() ? null : "before " + label(served.get(0)))
                : "after " + label(event.lastMealHere())));
        data.put("back", withMeal(event.returnDate(), event.firstMealBack() == null
                ? (served.isEmpty() ? null : "after " + label(served.get(served.size() - 1)))
                : "for " + label(event.firstMealBack())));
        if (event.reason() != null) {
            data.put("reason", event.reason());
        }
        if (event.tenancyReferenceCode() != null) {
            data.put("tenancyReferenceCode", event.tenancyReferenceCode());
        }

        String title;
        String body;
        NotificationSubtype subtype;
        switch (event.kind()) {
            case DECLARED -> {
                title = name + " is staying out";
                body = "Away " + dates + ".";
                subtype = NotificationSubtype.TENANCY_STAY_OUT_DECLARED;
            }
            case CHANGED -> {
                title = name + " changed a stay out";
                body = "Now away " + dates + ".";
                subtype = NotificationSubtype.TENANCY_STAY_OUT_CHANGED;
            }
            default -> {
                title = name + " cancelled a stay out";
                body = "Was going to be away " + dates + ".";
                subtype = NotificationSubtype.TENANCY_STAY_OUT_CANCELLED;
            }
        }
        notificationModule.notifyUsers(
                management(property),
                title,
                body,
                NotificationCategory.TENANCY,
                NotificationPriority.LOW,
                subtype,
                event.stayOutId(),
                data,
                NotificationDeliveryMode.IN_APP_ONLY,
                NotificationAudience.MANAGEMENT);
    }

    private List<UUID> management(PropertyResponse property) {
        List<UUID> recipients = new ArrayList<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        return recipients.stream().distinct().toList();
    }

    /** The meals the property serves, in the order of the day. */
    private static List<MealType> served(PropertyResponse property) {
        if (!property.foodIncluded() || property.includedMeals() == null) {
            return List.of();
        }
        return List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.EVENING_SNACKS, MealType.DINNER).stream()
                .filter(property.includedMeals()::contains)
                .toList();
    }

    private static String withMeal(LocalDate date, String meal) {
        return meal == null ? day(date) : day(date) + ", " + meal;
    }

    private static String label(MealType meal) {
        return MealScheduleRules.label(meal).toLowerCase(Locale.ENGLISH);
    }

    private static String day(LocalDate date) {
        return date.format(DAY);
    }
}
