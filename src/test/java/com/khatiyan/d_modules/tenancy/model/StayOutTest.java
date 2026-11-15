package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.MealType;

/** A declared stay out and the meals it takes a tenant off (user, 2026-11-08). */
class StayOutTest {

    private static final LocalDate FRI = LocalDate.of(2026, 11, 13);
    private static final LocalDate SUN = LocalDate.of(2026, 11, 15);

    private static StayOut fridayAfterLunchToSundayDinner() {
        return StayOut.declare(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                FRI, MealType.LUNCH, SUN, MealType.DINNER, "Home visit");
    }

    @Test
    void onTheLeavingDayOnlyMealsAfterTheLastOneHereAreOff() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        assertThat(stay.isAwayFor(FRI, MealType.BREAKFAST)).isFalse();
        assertThat(stay.isAwayFor(FRI, MealType.LUNCH)).isFalse();
        // Snacks come between lunch and dinner, whatever order the enum declares.
        assertThat(stay.isAwayFor(FRI, MealType.EVENING_SNACKS)).isTrue();
        assertThat(stay.isAwayFor(FRI, MealType.DINNER)).isTrue();
    }

    @Test
    void everyMealInBetweenIsOff() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        for (MealType meal : MealType.values()) {
            assertThat(stay.isAwayFor(FRI.plusDays(1), meal)).as(meal.name()).isTrue();
        }
    }

    @Test
    void onTheReturnDayMealsFromTheFirstOneBackAreOn() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        assertThat(stay.isAwayFor(SUN, MealType.LUNCH)).isTrue();
        assertThat(stay.isAwayFor(SUN, MealType.EVENING_SNACKS)).isTrue();
        assertThat(stay.isAwayFor(SUN, MealType.DINNER)).isFalse();
        assertThat(stay.isAwayFor(SUN.plusDays(1), MealType.BREAKFAST)).isFalse();
        assertThat(stay.isAwayFor(FRI.minusDays(1), MealType.DINNER)).isFalse();
    }

    /** No last meal = gone before the day's first one. No first meal back = back after the day's last. */
    @Test
    void noMealsGivenMeansTheWholeLeavingAndReturnDaysAreOff() {
        StayOut stay = StayOut.declare(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                FRI, null, SUN, null, null);
        assertThat(stay.isAwayFor(FRI, MealType.BREAKFAST)).isTrue();
        assertThat(stay.isAwayFor(SUN, MealType.DINNER)).isTrue();
    }

    @Test
    void aCancelledStayOutTakesNobodyOff() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        stay.cancel();
        assertThat(stay.isAwayFor(FRI.plusDays(1), MealType.LUNCH)).isFalse();
    }

    /** Away tonight = the nights from the leaving day up to, not including, the return day. */
    @Test
    void nightsAwayRunFromTheLeavingDayToTheNightBeforeTheReturn() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        assertThat(stay.isAwayOnNightOf(FRI)).isTrue();
        assertThat(stay.isAwayOnNightOf(FRI.plusDays(1))).isTrue();
        assertThat(stay.isAwayOnNightOf(SUN)).isFalse();
    }

    @Test
    void aStayOutIsAtLeastOneNight() {
        assertThatThrownBy(() -> StayOut.declare(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                FRI, null, FRI, null, null))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Come back at least a day after you leave.");
    }

    @Test
    void aStayOutIsAtMostSixtyNights() {
        StayOut.declare(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), FRI, null, FRI.plusDays(60), null, null);
        assertThatThrownBy(() -> StayOut.declare(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                FRI, null, FRI.plusDays(61), null, null))
                .isInstanceOf(ValidationException.class)
                .hasMessage("A stay out can be up to 60 nights.");
    }

    /** Two stay outs may touch (back Sunday, gone again Sunday night), never share a night. */
    @Test
    void overlapIsSharingANight() {
        StayOut stay = fridayAfterLunchToSundayDinner();
        assertThat(stay.overlaps(SUN, SUN.plusDays(2))).isFalse();
        assertThat(stay.overlaps(FRI.minusDays(2), FRI)).isFalse();
        assertThat(stay.overlaps(FRI.plusDays(1), SUN.plusDays(1))).isTrue();
    }
}
