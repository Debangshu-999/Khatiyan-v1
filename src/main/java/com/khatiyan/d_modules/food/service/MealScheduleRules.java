package com.khatiyan.d_modules.food.service;

import java.time.Duration;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * The shape of a property's meal day, as pure rules: which meals, when, which
 * one is next, and what a delay may do. No Spring, no clock, so every rule is
 * tested by passing "now" in.
 *
 * <p>One timetable per property, not per food profile (owner's call,
 * 2026-09-28): one kitchen cooks each meal once, and a delay moves that meal
 * for everybody.
 */
public final class MealScheduleRules {

    /** Meal times are local to the property, and every property is in India. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    /** Meal order through the day. {@code MealType}'s own order is not it. */
    public static final List<MealType> CHRONOLOGICAL =
            List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.EVENING_SNACKS, MealType.DINNER);

    /** A meal can be delayed until this long before it starts, and no later. */
    public static final Duration DELAY_CUTOFF = Duration.ofMinutes(10);

    /**
     * The timetable a property has until its owner saves one. Rows are stored
     * only once saved, so these are the times for every property that never
     * touched the setting.
     */
    public static final Map<MealType, MealWindow> DEFAULTS = Map.of(
            MealType.BREAKFAST, new MealWindow(LocalTime.of(7, 30), LocalTime.of(9, 30)),
            MealType.LUNCH, new MealWindow(LocalTime.of(12, 30), LocalTime.of(14, 30)),
            MealType.EVENING_SNACKS, new MealWindow(LocalTime.of(16, 30), LocalTime.of(17, 30)),
            MealType.DINNER, new MealWindow(LocalTime.of(20, 0), LocalTime.of(22, 0)));

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    private MealScheduleRules() {
    }

    public record MealWindow(LocalTime start, LocalTime end) {
    }

    public enum MealStatus {
        UPCOMING,
        SERVING,
        DONE
    }

    /** One meal on one day: its times with any delay applied, and where it stands now. */
    public record MealSlot(MealType mealType, LocalTime start, LocalTime end, int delayMinutes, MealStatus status) {
    }

    /**
     * Today's meals in order, each on its saved window (or the default), moved
     * by that day's delay, with its status at {@code now}.
     */
    public static List<MealSlot> day(
            Set<MealType> served,
            Map<MealType, MealWindow> timings,
            Map<MealType, Integer> delays,
            LocalTime now) {
        List<MealSlot> slots = new ArrayList<>();
        for (MealType meal : CHRONOLOGICAL) {
            if (!served.contains(meal)) {
                continue;
            }
            MealWindow window = timings.getOrDefault(meal, DEFAULTS.get(meal));
            int delay = delays.getOrDefault(meal, 0);
            LocalTime start = window.start().plusMinutes(delay);
            LocalTime end = window.end().plusMinutes(delay);
            MealStatus status = now.isBefore(start)
                    ? MealStatus.UPCOMING
                    : now.isBefore(end) ? MealStatus.SERVING : MealStatus.DONE;
            slots.add(new MealSlot(meal, start, end, delay, status));
        }
        return slots;
    }

    /**
     * The first meal of the day that has not finished. Empty once the last one
     * has: the next meal is only offered after midnight (owner's call,
     * 2026-09-28), so nobody reads tomorrow's breakfast at eleven at night as
     * if it were tonight's.
     */
    public static Optional<MealSlot> next(List<MealSlot> day) {
        return day.stream().filter(slot -> slot.status() != MealStatus.DONE).findFirst();
    }

    /** Every meal ends after it starts, and each starts no earlier than the one before ends. */
    public static void validateTimetable(Map<MealType, MealWindow> timetable) {
        MealType previous = null;
        for (MealType meal : CHRONOLOGICAL) {
            MealWindow window = timetable.get(meal);
            if (window == null) {
                continue;
            }
            if (window.start() == null || window.end() == null) {
                throw new ValidationException(label(meal) + " needs a start and an end time.");
            }
            if (!window.end().isAfter(window.start())) {
                // A meal starts and ends on the same day (user, 2026-09-29): an
                // end earlier than the start would be tomorrow, which a
                // day's timetable cannot hold.
                throw new ValidationException(label(meal) + " must start and end on the same day, and end after it starts.");
            }
            if (previous != null && window.start().isBefore(timetable.get(previous).end())) {
                throw new ValidationException(
                        label(meal) + " must start after " + label(previous).toLowerCase(Locale.ENGLISH)
                                + " ends at " + clock(timetable.get(previous).end()) + ".");
            }
            previous = meal;
        }
    }

    /**
     * The meal's new TOTAL delay, in minutes from its planned start, if moving
     * it to {@code newStart} is allowed.
     *
     * <p>Only an upcoming meal, only until 10 minutes before it starts, only
     * later, never into the next meal, never past midnight.
     */
    public static int delayMinutesFor(List<MealSlot> day, MealType meal, LocalTime newStart, LocalTime now) {
        int index = -1;
        for (int i = 0; i < day.size(); i++) {
            if (day.get(i).mealType() == meal) {
                index = i;
            }
        }
        if (index < 0) {
            throw new ValidationException(label(meal) + " is not served at this property.");
        }
        MealSlot slot = day.get(index);
        if (!beforeCutoff(slot, now)) {
            throw new ValidationException(
                    "A meal can only be delayed until " + DELAY_CUTOFF.toMinutes() + " minutes before it starts.");
        }
        if (!newStart.isAfter(slot.start())) {
            throw new ValidationException("Pick a time later than " + clock(slot.start()) + ".");
        }
        int lengthMinutes = minutesOfDay(slot.end()) - minutesOfDay(slot.start());
        int newEndMinutes = minutesOfDay(newStart) + lengthMinutes;
        if (newEndMinutes >= 24 * 60) {
            throw new ValidationException("The meal would run past midnight.");
        }
        if (index + 1 < day.size()) {
            MealSlot following = day.get(index + 1);
            if (newEndMinutes > minutesOfDay(following.start())) {
                throw new ValidationException(
                        "The meal would run into " + label(following.mealType()) + " at "
                                + clock(following.start()) + ".");
            }
        }
        int plannedStartMinutes = minutesOfDay(slot.start()) - slot.delayMinutes();
        return minutesOfDay(newStart) - plannedStartMinutes;
    }

    /**
     * Whether a meal can still be changed: it has not started, and it is more
     * than 10 minutes to its start. The start carries the day's delay, so the
     * cutoff moves with it. A delay and taking a dish off both close here
     * (2026-09-29).
     *
     * <p>Counted in minutes of the day, not as a clock time minus 10 minutes,
     * which wraps: a meal at 00:05 would have opened a window until 23:55.
     */
    public static boolean beforeCutoff(MealSlot slot, LocalTime now) {
        return slot.status() == MealStatus.UPCOMING
                && minutesOfDay(now) < minutesOfDay(slot.start()) - DELAY_CUTOFF.toMinutes();
    }

    public static String label(MealType meal) {
        return switch (meal) {
            case BREAKFAST -> "Breakfast";
            case LUNCH -> "Lunch";
            case EVENING_SNACKS -> "Evening snacks";
            case DINNER -> "Dinner";
        };
    }

    public static String clock(LocalTime time) {
        return time.format(CLOCK);
    }

    private static int minutesOfDay(LocalTime time) {
        return time.getHour() * 60 + time.getMinute();
    }
}
