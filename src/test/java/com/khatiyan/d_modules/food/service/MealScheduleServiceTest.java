package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.DelayMealRequest;
import com.khatiyan.d_modules.food.api.dto.MealScheduleResponse;
import com.khatiyan.d_modules.food.api.dto.SaveMealTimingsRequest;
import com.khatiyan.d_modules.food.event.MealDelayedEvent;
import com.khatiyan.d_modules.food.model.FoodMealDelay;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodMealDelayRepository;
import com.khatiyan.d_modules.food.repository.FoodMealTimingRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.MealType;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MealScheduleServiceTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    @Mock
    private PropertyModule propertyModule;
    @Mock
    private FoodModuleSettingService moduleSettingService;
    @Mock
    private FoodAccessPolicy accessPolicy;
    @Mock
    private FoodMealTimingRepository timingRepository;
    @Mock
    private FoodMealDelayRepository delayRepository;
    @Mock
    private FoodSubscriptionRepository subscriptionRepository;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    /** A service whose "now" is the given IST time on 2026-09-28. */
    private MealScheduleService serviceAtIst(String time) {
        Instant instant = Instant.parse("2026-09-28T" + time + ":00Z").minusSeconds(330 * 60);
        return new MealScheduleService(
                propertyModule,
                moduleSettingService,
                accessPolicy,
                timingRepository,
                delayRepository,
                subscriptionRepository,
                eventPublisher,
                Clock.fixed(instant, ZoneOffset.UTC));
    }

    private void servingOnly(MealType... meals) {
        var property = FoodTestFixtures.property(PROPERTY, true, Set.of(meals));
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property);
        when(moduleSettingService.requireUsable(PROPERTY)).thenReturn(property);
    }

    // ----- A meal's dishes are fixed once it starts (2026-09-29) -----

    private static final java.time.LocalDate TODAY = java.time.LocalDate.of(2026, 9, 28);

    @Test
    void aMealBeingServedCannotChangeItsDishes() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

        assertThatThrownBy(() -> serviceAtIst("13:00").requireNotStarted(PROPERTY, TODAY, MealType.LUNCH))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Lunch is being served, so its dishes can no longer change.");
    }

    @Test
    void aServedMealCannotChangeItsDishes() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

        assertThatThrownBy(() -> serviceAtIst("15:00").requireNotStarted(PROPERTY, TODAY, MealType.LUNCH))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Lunch is over, so its dishes can no longer change.");
    }

    @Test
    void anUpcomingMealOrALaterDayCanStillChange() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

        serviceAtIst("11:00").requireNotStarted(PROPERTY, TODAY, MealType.LUNCH);
        serviceAtIst("23:00").requireNotStarted(PROPERTY, TODAY.plusDays(1), MealType.BREAKFAST);
    }

    /** Taking a dish off is for the day itself (user, 2026-09-29). */
    @Test
    void aDishComesOffOnlyOnTheDayItself() {
        serviceAtIst("09:00").requireToday(TODAY);

        assertThatThrownBy(() -> serviceAtIst("09:00").requireToday(TODAY.plusDays(1)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("A dish can be marked unavailable only on the day itself.");
    }

    /** Like a delay, only until 10 minutes before the meal starts (user, 2026-09-29). */
    @Test
    void aDishCannotComeOffInTheLastTenMinutesBeforeAMeal() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

        serviceAtIst("12:15").requireDishWindowOpen(PROPERTY, TODAY, MealType.LUNCH);
        assertThatThrownBy(() -> serviceAtIst("12:25").requireDishWindowOpen(PROPERTY, TODAY, MealType.LUNCH))
                .isInstanceOf(ValidationException.class)
                .hasMessage("The mark unavailable window has passed for lunch.");
    }

    /** A delayed lunch keeps its window open until 10 minutes before its new start. */
    @Test
    void theDishWindowFollowsADelay() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);
        when(delayRepository.findByPropertyIdAndMealDate(PROPERTY, TODAY)).thenReturn(List.of(
                FoodMealDelay.create(PROPERTY, TODAY, MealType.LUNCH, 30, ACTOR)));

        serviceAtIst("12:45").requireDishWindowOpen(PROPERTY, TODAY, MealType.LUNCH);
        assertThatThrownBy(() -> serviceAtIst("12:55").requireDishWindowOpen(PROPERTY, TODAY, MealType.LUNCH))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void aDayThatIsOverCannotChange() {
        servingOnly(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

        assertThatThrownBy(() -> serviceAtIst("06:00").requireNotStarted(PROPERTY, TODAY.minusDays(1), MealType.DINNER))
                .isInstanceOf(ValidationException.class)
                .hasMessage("That day is over, so its dishes can no longer change.");
    }

    @Test
    void delayingAMealStoresTheTotalAndTellsEveryoneOnAPlan() {
        servingOnly(MealType.DINNER);
        UUID tenant = UUID.randomUUID();
        when(subscriptionRepository.findCovering(org.mockito.ArgumentMatchers.eq(PROPERTY), any()))
                .thenReturn(List.of(FoodSubscription.start(PROPERTY, UUID.randomUUID(), tenant,
                        FoodSubscription.everyDay(UUID.randomUUID()), java.time.LocalDate.of(2026, 9, 1))));
        // Stands in for the database: a query after the save sees the new row,
        // as JPA's flush-before-query makes it.
        List<FoodMealDelay> stored = new java.util.ArrayList<>();
        when(delayRepository.findByPropertyIdAndMealDate(any(), any())).thenAnswer(invocation -> List.copyOf(stored));
        when(delayRepository.save(any(FoodMealDelay.class))).thenAnswer(invocation -> {
            stored.add(invocation.getArgument(0));
            return invocation.getArgument(0);
        });

        MealScheduleResponse response = serviceAtIst("18:30")
                .delay(ACTOR, PROPERTY, new DelayMealRequest(MealType.DINNER, LocalTime.of(20, 45)));

        ArgumentCaptor<FoodMealDelay> saved = ArgumentCaptor.forClass(FoodMealDelay.class);
        verify(delayRepository).save(saved.capture());
        assertThat(saved.getValue().getDelayMinutes()).isEqualTo(45);

        ArgumentCaptor<MealDelayedEvent> event = ArgumentCaptor.forClass(MealDelayedEvent.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue().tenantUserIds()).containsExactly(tenant);
        assertThat(event.getValue().newStartTime()).isEqualTo(LocalTime.of(20, 45));
        assertThat(event.getValue().newEndTime()).isEqualTo(LocalTime.of(22, 45));

        assertThat(response.nextMeal().startTime()).isEqualTo(LocalTime.of(20, 45));
        assertThat(response.nextMeal().delayMinutes()).isEqualTo(45);
    }

    @Test
    void aMealThePropertyDoesNotServeCannotBeTimed() {
        servingOnly(MealType.DINNER);

        assertThatThrownBy(() -> serviceAtIst("10:00").saveTimings(ACTOR, PROPERTY, new SaveMealTimingsRequest(List.of(
                new SaveMealTimingsRequest.Timing(MealType.BREAKFAST, LocalTime.of(8, 0), LocalTime.of(9, 0))))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Breakfast");
        verify(timingRepository, never()).save(any());
    }

    @Test
    void theScheduleHasNoNextMealOnceTheDayIsOver() {
        servingOnly(MealType.BREAKFAST, MealType.DINNER);

        MealScheduleResponse response = serviceAtIst("23:00").schedule(ACTOR, PROPERTY);

        assertThat(response.nextMeal()).isNull();
        assertThat(response.today()).hasSize(2);
    }
}
