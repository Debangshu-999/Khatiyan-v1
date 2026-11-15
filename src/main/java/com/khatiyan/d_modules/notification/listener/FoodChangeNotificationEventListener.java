package com.khatiyan.d_modules.notification.listener;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.food.event.FoodMenuChangedEvent;
import com.khatiyan.d_modules.food.event.MealDishAvailabilityChangedEvent;
import com.khatiyan.d_modules.food.event.MealTimingsChangedEvent;
import com.khatiyan.d_modules.food.service.MealScheduleRules;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealWindow;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.notification.repository.NotificationRepository;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * The food notices beyond "meal delayed" (P1.5.h, 2026-11-08): a dish off or
 * back on one day's meal, a plan's weekly menu, and the meal timetable.
 *
 * <p>Each event carries its recipients, worked out in the food module when the
 * owner acted. Every notice is a tenant's, read in their stay.
 */
@Component
public class FoodChangeNotificationEventListener {

    private final NotificationModule notificationModule;
    private final NotificationRepository notificationRepository;
    private final Clock clock;

    public FoodChangeNotificationEventListener(
            NotificationModule notificationModule,
            NotificationRepository notificationRepository,
            Clock clock) {
        this.notificationModule = notificationModule;
        this.notificationRepository = notificationRepository;
        this.clock = clock;
    }

    @ApplicationModuleListener
    public void onDishAvailabilityChanged(MealDishAvailabilityChangedEvent event) {
        String meal = MealScheduleRules.label(event.mealType()).toLowerCase(Locale.ENGLISH);
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", event.propertyName());
        data.put("mealType", event.mealType().name());
        data.put("mealDate", event.mealDate().toString());
        data.put("itemName", event.itemName());

        String title = event.available()
                ? event.itemName() + " is back on today's " + meal
                : event.itemName() + " is off today's " + meal;
        String body = event.available()
                ? event.itemName() + " will be served at " + meal + " today at " + event.propertyName() + " after all."
                : event.itemName() + " will not be served at " + meal + " today at " + event.propertyName() + ".";
        send(event.tenantUserIds(), title, body,
                event.available() ? NotificationSubtype.FOOD_DISH_AVAILABLE : NotificationSubtype.FOOD_DISH_UNAVAILABLE,
                event.propertyId(), data);
    }

    /**
     * An owner edits a menu one dish at a time, so the first change of the day
     * to a plan is the notice and later ones that day fold into it. The tenant
     * opens the menu as it stands, so they see every change either way.
     */
    @ApplicationModuleListener
    public void onMenuChanged(FoodMenuChangedEvent event) {
        if (event.tenantUserIds().isEmpty()) {
            return;
        }
        Instant startOfDay = LocalDate.now(clock.withZone(MealScheduleRules.ZONE))
                .atStartOfDay(MealScheduleRules.ZONE)
                .toInstant();
        if (notificationRepository.existsBySubtypeAndSourceIdAndCreatedAtGreaterThanEqual(
                NotificationSubtype.FOOD_MENU_CHANGED, event.profileId(), startOfDay)) {
            return;
        }
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", event.propertyName());
        data.put("profileName", event.profileName());
        // The plan is the source, which is what the once-a-day check reads.
        send(event.tenantUserIds(),
                "Your " + event.profileName() + " menu changed",
                event.propertyName() + " changed the " + event.profileName()
                        + " weekly menu. Open Food to see what is on each day.",
                NotificationSubtype.FOOD_MENU_CHANGED, event.profileId(), data);
    }

    @ApplicationModuleListener
    public void onMealTimingsChanged(MealTimingsChangedEvent event) {
        List<Map.Entry<MealType, MealWindow>> meals = event.changed().entrySet().stream()
                .sorted(Comparator.comparing((Map.Entry<MealType, MealWindow> entry) -> entry.getValue().start()))
                .toList();
        Map<String, String> data = new LinkedHashMap<>();
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", event.propertyName());
        // One key per meal, "08:00-09:30", for the app's detail lines.
        for (Map.Entry<MealType, MealWindow> meal : meals) {
            data.put("time_" + meal.getKey().name(), meal.getValue().start() + "-" + meal.getValue().end());
        }
        String list = meals.stream()
                .map(meal -> MealScheduleRules.label(meal.getKey()) + " " + clock(meal.getValue().start())
                        + " to " + clock(meal.getValue().end()))
                .collect(Collectors.joining(", "));
        send(event.tenantUserIds(), "Meal times changed",
                "New meal times at " + event.propertyName() + ". " + list + ".",
                NotificationSubtype.FOOD_MEAL_TIMINGS_CHANGED, event.propertyId(), data);
    }

    private void send(
            List<UUID> tenants, String title, String body, NotificationSubtype subtype, UUID sourceId,
            Map<String, String> data) {
        if (tenants.isEmpty()) {
            return;
        }
        notificationModule.notifyUsers(
                tenants, title, body,
                NotificationCategory.NOTICE,
                NotificationPriority.NORMAL,
                subtype,
                sourceId,
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);
    }

    private static String clock(LocalTime time) {
        return MealScheduleRules.clock(time).toLowerCase(Locale.ENGLISH);
    }
}
