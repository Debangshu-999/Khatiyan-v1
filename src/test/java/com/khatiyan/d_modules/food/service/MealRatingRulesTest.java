package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.food.service.MealRatingRules.LastMeal;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.food.service.MealScheduleRules.MealStatus;
import com.khatiyan.d_modules.property.model.MealType;

class MealRatingRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 1);

    private static MealSlot slot(MealType meal, String start, String end) {
        return new MealSlot(meal, LocalTime.parse(start), LocalTime.parse(end), 0, MealStatus.UPCOMING);
    }

    private static final List<MealSlot> DAY = List.of(
            slot(MealType.BREAKFAST, "08:00", "10:00"),
            slot(MealType.LUNCH, "13:00", "15:00"),
            slot(MealType.DINNER, "20:30", "22:30"));

    private static LastMeal at(String time) {
        return MealRatingRules.lastMeal(DAY, TODAY, LocalTime.parse(time)).orElse(null);
    }

    @Test
    void beforeTheFirstMealOfTheDayYesterdaysLastMealIsOnOffer() {
        assertThat(at("07:59")).isEqualTo(new LastMeal(TODAY.minusDays(1), MealType.DINNER));
    }

    @Test
    void aMealOpensWhenItEndsAndClosesWhenTheNextStarts() {
        assertThat(at("09:59")).isNull();
        assertThat(at("10:00")).isEqualTo(new LastMeal(TODAY, MealType.BREAKFAST));
        assertThat(at("12:59")).isEqualTo(new LastMeal(TODAY, MealType.BREAKFAST));
        assertThat(at("13:00")).isNull();
        assertThat(at("15:00")).isEqualTo(new LastMeal(TODAY, MealType.LUNCH));
    }

    @Test
    void theDaysLastMealStaysOpenUntilMidnightAndOn() {
        assertThat(at("22:30")).isEqualTo(new LastMeal(TODAY, MealType.DINNER));
        assertThat(at("23:59")).isEqualTo(new LastMeal(TODAY, MealType.DINNER));
    }

    @Test
    void aMealThatRunsIntoTheNextIsClosedOnceTheNextHasStarted() {
        List<MealSlot> overlapping = List.of(
                slot(MealType.BREAKFAST, "08:00", "13:30"),
                slot(MealType.LUNCH, "13:00", "15:00"));

        assertThat(MealRatingRules.lastMeal(overlapping, TODAY, LocalTime.parse("13:45"))).isEmpty();
    }

    @Test
    void aPropertyServingNoMealsOffersNothing() {
        assertThat(MealRatingRules.lastMeal(List.of(), TODAY, LocalTime.NOON)).isEmpty();
    }

    @Test
    void aRatingSaysWhatItShowsToOnePlace() {
        assertThat(MealRatingRules.generic(4.5, "dish")).isEqualTo("This dish is delightful.");
        assertThat(MealRatingRules.generic(4.46, "dish")).isEqualTo("This dish is delightful.");
        assertThat(MealRatingRules.generic(4.44, "dish")).isEqualTo("This dish is good.");
        assertThat(MealRatingRules.generic(4.0, "dish")).isEqualTo("This dish is good.");
        assertThat(MealRatingRules.generic(3.9, "dish")).isEqualTo("This dish is average.");
        assertThat(MealRatingRules.generic(2.5, "dish")).isEqualTo("This dish is average.");
        assertThat(MealRatingRules.generic(3.0, "plan")).isEqualTo("This plan is average.");
        assertThat(MealRatingRules.generic(2.4, "dish")).isEqualTo("This dish is poor.");
    }
}
