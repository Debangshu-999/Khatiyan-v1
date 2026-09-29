package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealStatus;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealWindow;
import com.khatiyan.d_modules.property.model.MealType;

/** The meal day: which meal is next, when the day is over, and what a delay may do. */
class MealScheduleRulesTest {

    private static final Set<MealType> ALL = EnumSet.allOf(MealType.class);

    private static List<MealSlot> dayAt(String now) {
        return MealScheduleRules.day(ALL, Map.of(), Map.of(), LocalTime.parse(now));
    }

    @Test
    void theDayRunsInMealOrderOnTheDefaultsWhenNothingIsSaved() {
        List<MealSlot> day = dayAt("06:00");

        assertThat(day).extracting(MealSlot::mealType)
                .containsExactly(MealType.BREAKFAST, MealType.LUNCH, MealType.EVENING_SNACKS, MealType.DINNER);
        assertThat(day.get(0).start()).isEqualTo(LocalTime.of(7, 30));
        assertThat(day.get(3).end()).isEqualTo(LocalTime.of(22, 0));
    }

    @Test
    void onlyTheMealsThePropertyServesAreInTheDay() {
        List<MealSlot> day = MealScheduleRules.day(
                EnumSet.of(MealType.DINNER, MealType.BREAKFAST), Map.of(), Map.of(), LocalTime.NOON);

        assertThat(day).extracting(MealSlot::mealType).containsExactly(MealType.BREAKFAST, MealType.DINNER);
    }

    @Test
    void theNextMealIsTheFirstOneNotFinished() {
        assertThat(MealScheduleRules.next(dayAt("10:00")))
                .get().extracting(MealSlot::mealType, MealSlot::status)
                .containsExactly(MealType.LUNCH, MealStatus.UPCOMING);
        assertThat(MealScheduleRules.next(dayAt("13:00")))
                .get().extracting(MealSlot::mealType, MealSlot::status)
                .containsExactly(MealType.LUNCH, MealStatus.SERVING);
    }

    /** After the last meal the day is over: nothing is "next" until midnight. */
    @Test
    void thereIsNoNextMealAfterTheLastOneUntilMidnight() {
        assertThat(MealScheduleRules.next(dayAt("22:30"))).isEmpty();
        assertThat(MealScheduleRules.next(dayAt("00:30")))
                .get().extracting(MealSlot::mealType).isEqualTo(MealType.BREAKFAST);
    }

    @Test
    void aDelayMovesTheWholeMeal() {
        List<MealSlot> day = MealScheduleRules.day(ALL, Map.of(), Map.of(MealType.DINNER, 30), LocalTime.NOON);

        MealSlot dinner = day.get(3);
        assertThat(dinner.start()).isEqualTo(LocalTime.of(20, 30));
        assertThat(dinner.end()).isEqualTo(LocalTime.of(22, 30));
        assertThat(dinner.delayMinutes()).isEqualTo(30);
    }

    @Test
    void savedTimingsReplaceTheDefaults() {
        List<MealSlot> day = MealScheduleRules.day(
                ALL,
                Map.of(MealType.BREAKFAST, new MealWindow(LocalTime.of(8, 0), LocalTime.of(9, 0))),
                Map.of(),
                LocalTime.MIDNIGHT);

        assertThat(day.get(0).start()).isEqualTo(LocalTime.of(8, 0));
        assertThat(day.get(1).start()).isEqualTo(LocalTime.of(12, 30));
    }

    @Test
    void aTimetableMustRunInOrderWithoutOverlap() {
        assertThatThrownBy(() -> MealScheduleRules.validateTimetable(Map.of(
                MealType.BREAKFAST, new MealWindow(LocalTime.of(8, 0), LocalTime.of(13, 0)),
                MealType.LUNCH, new MealWindow(LocalTime.of(12, 30), LocalTime.of(14, 0)))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Lunch");
        assertThatThrownBy(() -> MealScheduleRules.validateTimetable(Map.of(
                MealType.DINNER, new MealWindow(LocalTime.of(21, 0), LocalTime.of(20, 0)))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Dinner");
    }

    /** 11 pm to 1 am would end tomorrow: refused (user, 2026-09-29). */
    @Test
    void aMealCannotCrossMidnight() {
        assertThatThrownBy(() -> MealScheduleRules.validateTimetable(Map.of(
                MealType.DINNER, new MealWindow(LocalTime.of(23, 0), LocalTime.of(1, 0)))))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Dinner must start and end on the same day, and end after it starts.");
    }

    @Test
    void aMealMayStartTheMinuteTheLastOneEnds() {
        MealScheduleRules.validateTimetable(Map.of(
                MealType.BREAKFAST, new MealWindow(LocalTime.of(8, 0), LocalTime.of(10, 0)),
                MealType.LUNCH, new MealWindow(LocalTime.of(10, 0), LocalTime.of(11, 0))));
    }

    @Test
    void aDelayIsTheNewTotalFromTheOriginalStart() {
        assertThat(MealScheduleRules.delayMinutesFor(dayAt("19:40"), MealType.DINNER, LocalTime.of(20, 30), LocalTime.of(19, 40)))
                .isEqualTo(30);

        List<MealSlot> alreadyDelayed = MealScheduleRules.day(ALL, Map.of(), Map.of(MealType.DINNER, 30), LocalTime.of(19, 50));
        assertThat(MealScheduleRules.delayMinutesFor(alreadyDelayed, MealType.DINNER, LocalTime.of(21, 0), LocalTime.of(19, 50)))
                .isEqualTo(60);
    }

    @Test
    void aDelayClosesTenMinutesBeforeTheMealStarts() {
        assertThatThrownBy(() -> MealScheduleRules.delayMinutesFor(
                dayAt("19:55"), MealType.DINNER, LocalTime.of(20, 30), LocalTime.of(19, 55)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("10 minutes");
    }

    /** The dish window closes when a delay would (user, 2026-09-29): one rule for both. */
    @Test
    void aMealsDishesAreOpenUntilTenMinutesBeforeItStarts() {
        assertThat(MealScheduleRules.beforeCutoff(lunch(dayAt("12:19")), LocalTime.of(12, 19))).isTrue();
        assertThat(MealScheduleRules.beforeCutoff(lunch(dayAt("12:20")), LocalTime.of(12, 20))).isFalse();
        assertThat(MealScheduleRules.beforeCutoff(lunch(dayAt("13:00")), LocalTime.of(13, 0))).isFalse();
    }

    /** A delayed meal's window moves with its start. */
    @Test
    void aDelayMovesTheDishWindowToo() {
        LocalTime now = LocalTime.of(12, 25);
        MealSlot delayedLunch = lunch(MealScheduleRules.day(ALL, Map.of(), Map.of(MealType.LUNCH, 30), now));

        assertThat(delayedLunch.start()).isEqualTo(LocalTime.of(13, 0));
        assertThat(MealScheduleRules.beforeCutoff(delayedLunch, now)).isTrue();
        assertThat(MealScheduleRules.beforeCutoff(delayedLunch, LocalTime.of(12, 50))).isFalse();
    }

    /** A meal just after midnight has no window left, not a whole day of one. */
    @Test
    void theCutoffDoesNotWrapPastMidnight() {
        LocalTime now = LocalTime.of(0, 1);
        MealSlot early = MealScheduleRules.day(
                Set.of(MealType.BREAKFAST),
                Map.of(MealType.BREAKFAST, new MealWindow(LocalTime.of(0, 5), LocalTime.of(1, 0))),
                Map.of(),
                now).get(0);

        assertThat(MealScheduleRules.beforeCutoff(early, now)).isFalse();
    }

    private static MealSlot lunch(List<MealSlot> day) {
        return day.stream().filter(slot -> slot.mealType() == MealType.LUNCH).findFirst().orElseThrow();
    }

    @Test
    void aMealCannotBeBroughtForward() {
        assertThatThrownBy(() -> MealScheduleRules.delayMinutesFor(
                dayAt("18:00"), MealType.DINNER, LocalTime.of(19, 30), LocalTime.of(18, 0)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("later");
    }

    @Test
    void aDelayCannotRunIntoTheNextMeal() {
        assertThatThrownBy(() -> MealScheduleRules.delayMinutesFor(
                dayAt("10:00"), MealType.LUNCH, LocalTime.of(15, 0), LocalTime.of(10, 0)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Evening snacks");
    }

    @Test
    void aDelayCannotRunPastMidnight() {
        assertThatThrownBy(() -> MealScheduleRules.delayMinutesFor(
                dayAt("18:00"), MealType.DINNER, LocalTime.of(22, 30), LocalTime.of(18, 0)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("midnight");
    }
}
