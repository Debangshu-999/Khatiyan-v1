package com.khatiyan.d_modules.property.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.PropertyVisitSettings.SlotTimes;

/** The visit slot rules (user, 2026-09-30). */
class PropertyVisitSettingsTest {

    private static SlotTimes slot(String start, String end) {
        return new SlotTimes(LocalTime.parse(start), LocalTime.parse(end));
    }

    private static PropertyVisitSettings settings() {
        return PropertyVisitSettings.create(UUID.randomUUID());
    }

    @Test
    void slotsAreNumberedByStartTimeWhateverOrderTheyArriveIn() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(Set.of(DayOfWeek.MONDAY), List.of(slot("16:00", "17:00"), slot("10:00", "11:00")), 2);

        assertThat(settings.slotsOn(DayOfWeek.MONDAY))
                .extracting(VisitSlot::getStartTime)
                .containsExactly(LocalTime.of(10, 0), LocalTime.of(16, 0));
    }

    @Test
    void createForAllDaysPutsTheSameSlotsOnEveryDay() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(EnumSet.allOf(DayOfWeek.class), List.of(slot("10:00", "11:00")), 2);

        for (DayOfWeek day : DayOfWeek.values()) {
            assertThat(settings.slotsOn(day)).hasSize(1);
        }
    }

    @Test
    void savingChosenDaysReplacesOnlyThoseDays() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(EnumSet.allOf(DayOfWeek.class), List.of(slot("10:00", "11:00")), 2);

        settings.replaceDays(Set.of(DayOfWeek.SATURDAY), List.of(slot("11:00", "13:00"), slot("15:00", "16:00")), 2);

        assertThat(settings.slotsOn(DayOfWeek.SATURDAY)).hasSize(2);
        assertThat(settings.slotsOn(DayOfWeek.MONDAY))
                .extracting(VisitSlot::getStartTime)
                .containsExactly(LocalTime.of(10, 0));
    }

    @Test
    void aClearedDayTakesNoVisits() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(EnumSet.allOf(DayOfWeek.class), List.of(slot("10:00", "11:00")), 2);

        settings.clearDays(Set.of(DayOfWeek.SUNDAY));

        assertThat(settings.slotsOn(DayOfWeek.SUNDAY)).isEmpty();
        assertThat(settings.slotsOn(DayOfWeek.SATURDAY)).hasSize(1);
    }

    @Test
    void backToBackSlotsAreFineAndThereIsNoMinimumLength() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(Set.of(DayOfWeek.MONDAY), List.of(slot("10:00", "10:05"), slot("10:05", "11:00")), 2);

        assertThat(settings.slotsOn(DayOfWeek.MONDAY)).hasSize(2);
    }

    @Test
    void refusesOverlappingSlots() {
        assertThatThrownBy(() -> settings().replaceDays(
                        Set.of(DayOfWeek.MONDAY), List.of(slot("10:00", "11:00"), slot("10:30", "12:00")), 2))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Slot 1 and Slot 2 overlap");
    }

    @Test
    void refusesASlotThatEndsBeforeItStarts() {
        assertThatThrownBy(() -> settings().replaceDays(Set.of(DayOfWeek.MONDAY), List.of(slot("23:00", "01:00")), 2))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Slot 1 must end after it starts, on the same day");
    }

    @Test
    void refusesMoreThanFiveSlotsADay() {
        List<SlotTimes> six = java.util.stream.IntStream.range(0, 6)
                .mapToObj(hour -> slot(String.format("%02d:00", hour + 8), String.format("%02d:30", hour + 8)))
                .toList();

        assertThatThrownBy(() -> settings().replaceDays(Set.of(DayOfWeek.MONDAY), six, 2))
                .isInstanceOf(ValidationException.class)
                .hasMessage("A day can have at most 5 slots");
    }

    @Test
    void refusesAMissingTimeAndNoDays() {
        assertThatThrownBy(() -> settings().replaceDays(
                        Set.of(DayOfWeek.MONDAY), List.of(new SlotTimes(LocalTime.of(10, 0), null)), 2))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Pick a start and end time for every slot");
        assertThatThrownBy(() -> settings().replaceDays(Set.of(), List.of(slot("10:00", "11:00")), 2))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose at least one day");
    }

    @Test
    void visitorsPerSlotStaysBetweenOneAndFifty() {
        assertThatThrownBy(() -> settings().replaceDays(
                        Set.of(DayOfWeek.MONDAY), List.of(slot("10:00", "11:00")), 0))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> settings().replaceDays(
                        Set.of(DayOfWeek.MONDAY), List.of(slot("10:00", "11:00")), 51))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void eachDayKeepsItsOwnVisitorsPerSlot() {
        PropertyVisitSettings settings = settings();
        settings.replaceDays(Set.of(DayOfWeek.MONDAY), List.of(slot("09:00", "11:00")), 2);
        settings.replaceDays(Set.of(DayOfWeek.TUESDAY), List.of(slot("09:00", "11:00")), 4);

        assertThat(settings.slotsOn(DayOfWeek.MONDAY))
                .extracting(VisitSlot::getVisitorsPerSlot)
                .containsOnly(2);
        assertThat(settings.slotsOn(DayOfWeek.TUESDAY))
                .extracting(VisitSlot::getVisitorsPerSlot)
                .containsOnly(4);
    }
}
