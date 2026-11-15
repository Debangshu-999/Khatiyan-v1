package com.khatiyan.d_modules.notification.listener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.food.event.FoodMenuChangedEvent;
import com.khatiyan.d_modules.food.event.MealDishAvailabilityChangedEvent;
import com.khatiyan.d_modules.food.event.MealTimingsChangedEvent;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealWindow;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.notification.repository.NotificationRepository;
import com.khatiyan.d_modules.property.model.MealType;

/** The food notices beyond "meal delayed" (P1.5.h, 2026-11-08). */
@ExtendWith(MockitoExtension.class)
class FoodChangeNotificationEventListenerTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID TENANT = UUID.randomUUID();
    /** 10:00 IST on 2026-09-21. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-21T04:30:00Z"), ZoneOffset.UTC);
    /** Midnight IST that day. */
    private static final Instant START_OF_DAY = Instant.parse("2026-09-20T18:30:00Z");

    @Mock private NotificationModule notificationModule;
    @Mock private NotificationRepository notificationRepository;

    private FoodChangeNotificationEventListener listener() {
        return new FoodChangeNotificationEventListener(notificationModule, notificationRepository, CLOCK);
    }

    @Test
    void aDishTakenOffSaysWhichMealItLeaves() {
        listener().onDishAvailabilityChanged(new MealDishAvailabilityChangedEvent(
                PROPERTY, "Sky PG", LocalDate.of(2026, 9, 21), MealType.LUNCH, "Paneer", false, List.of(TENANT)));

        verifySent(NotificationSubtype.FOOD_DISH_UNAVAILABLE, "Paneer is off today's lunch",
                "Paneer will not be served at lunch today at Sky PG.");
    }

    @Test
    void aDishPutBackSaysItIsServedAfterAll() {
        listener().onDishAvailabilityChanged(new MealDishAvailabilityChangedEvent(
                PROPERTY, "Sky PG", LocalDate.of(2026, 9, 21), MealType.LUNCH, "Paneer", true, List.of(TENANT)));

        verifySent(NotificationSubtype.FOOD_DISH_AVAILABLE, "Paneer is back on today's lunch",
                "Paneer will be served at lunch today at Sky PG after all.");
    }

    @Test
    void newMealTimesAreListedInTheOrderOfTheDay() {
        Map<MealType, MealWindow> changed = new EnumMap<>(MealType.class);
        changed.put(MealType.DINNER, new MealWindow(LocalTime.of(20, 30), LocalTime.of(22, 0)));
        changed.put(MealType.BREAKFAST, new MealWindow(LocalTime.of(8, 0), LocalTime.of(9, 30)));

        listener().onMealTimingsChanged(new MealTimingsChangedEvent(PROPERTY, "Sky PG", changed, List.of(TENANT)));

        verifySent(NotificationSubtype.FOOD_MEAL_TIMINGS_CHANGED, "Meal times changed",
                "New meal times at Sky PG. Breakfast 8:00 am to 9:30 am, Dinner 8:30 pm to 10:00 pm.");
    }

    @Test
    void theFirstMenuChangeOfTheDayIsSent() {
        UUID profile = UUID.randomUUID();
        when(notificationRepository.existsBySubtypeAndSourceIdAndCreatedAtGreaterThanEqual(
                NotificationSubtype.FOOD_MENU_CHANGED, profile, START_OF_DAY)).thenReturn(false);

        listener().onMenuChanged(new FoodMenuChangedEvent(PROPERTY, "Sky PG", profile, "Veg", List.of(TENANT)));

        ArgumentCaptor<Map<String, String>> data = mapCaptor();
        verify(notificationModule).notifyUsers(eq(List.of(TENANT)), eq("Your Veg menu changed"),
                eq("Sky PG changed the Veg weekly menu. Open Food to see what is on each day."),
                eq(NotificationCategory.NOTICE), eq(NotificationPriority.NORMAL), eq(NotificationSubtype.FOOD_MENU_CHANGED),
                eq(profile), data.capture(), eq(NotificationDeliveryMode.IN_APP_AND_PUSH), eq(NotificationAudience.TENANT));
        assertThat(data.getValue()).containsEntry("profileName", "Veg").containsEntry("propertyName", "Sky PG");
    }

    /** An owner edits a menu a dish at a time. One notice a day per plan, not one per dish. */
    @Test
    void laterMenuChangesThatDayAreFoldedIntoTheFirst() {
        UUID profile = UUID.randomUUID();
        when(notificationRepository.existsBySubtypeAndSourceIdAndCreatedAtGreaterThanEqual(
                NotificationSubtype.FOOD_MENU_CHANGED, profile, START_OF_DAY)).thenReturn(true);

        listener().onMenuChanged(new FoodMenuChangedEvent(PROPERTY, "Sky PG", profile, "Veg", List.of(TENANT)));

        verify(notificationModule, never()).notifyUsers(any(), anyString(), anyString(), any(), any(),
                any(NotificationSubtype.class), any(), anyMap(), any(), any(NotificationAudience.class));
    }

    @Test
    void nobodyToTellSendsNothing() {
        listener().onDishAvailabilityChanged(new MealDishAvailabilityChangedEvent(
                PROPERTY, "Sky PG", LocalDate.of(2026, 9, 21), MealType.LUNCH, "Paneer", false, List.of()));

        verify(notificationModule, never()).notifyUsers(any(), anyString(), anyString(), any(), any(),
                any(NotificationSubtype.class), any(), anyMap(), any(), any(NotificationAudience.class));
    }

    private void verifySent(NotificationSubtype subtype, String title, String body) {
        verify(notificationModule).notifyUsers(eq(List.of(TENANT)), eq(title), eq(body),
                eq(NotificationCategory.NOTICE), eq(NotificationPriority.NORMAL), eq(subtype),
                eq(PROPERTY), anyMap(), eq(NotificationDeliveryMode.IN_APP_AND_PUSH), eq(NotificationAudience.TENANT));
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Map<String, String>> mapCaptor() {
        return ArgumentCaptor.forClass((Class<Map<String, String>>) (Class<?>) Map.class);
    }
}
