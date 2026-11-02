package com.khatiyan.d_modules.food.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import com.khatiyan.d_modules.food.service.MealScheduleRules.MealSlot;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * Which meal is on offer for rating, and what a rating says on its own. No I/O,
 * so both are tested on their own (user, 2026-11-01).
 */
public final class MealRatingRules {

    private MealRatingRules() {
    }

    public record LastMeal(LocalDate date, MealType mealType) {
    }

    /**
     * The one meal on offer. A meal opens when it ends and closes when the next
     * meal in the schedule starts, so there is never more than one. Before the
     * day's first meal that is the last meal of yesterday.
     *
     * @param today today's meals in order, as the schedule gives them
     */
    public static Optional<LastMeal> lastMeal(List<MealSlot> today, LocalDate date, LocalTime now) {
        if (today.isEmpty()) {
            return Optional.empty();
        }
        if (now.isBefore(today.get(0).start())) {
            return Optional.of(new LastMeal(date.minusDays(1), today.get(today.size() - 1).mealType()));
        }
        for (int index = today.size() - 1; index >= 0; index--) {
            MealSlot slot = today.get(index);
            if (!now.isBefore(slot.end())) {
                boolean nextStarted = index + 1 < today.size() && !now.isBefore(today.get(index + 1).start());
                return nextStarted ? Optional.empty() : Optional.of(new LastMeal(date, slot.mealType()));
            }
        }
        return Optional.empty();
    }

    /**
     * What a rating says when nobody wrote anything (user, 2026-11-01). Read from
     * the rating as the owner sees it, to one place, so a 4.5 on screen is never
     * called anything but a 4.5.
     *
     * @param noun "dish" or "plan"
     */
    public static String generic(double rating, String noun) {
        double shown = Math.round(rating * 10) / 10.0;
        if (shown >= 4.5) {
            return "This " + noun + " is delightful.";
        }
        if (shown >= 4) {
            return "This " + noun + " is good.";
        }
        if (shown >= 2.5) {
            return "This " + noun + " is average.";
        }
        return "This " + noun + " is poor.";
    }
}
