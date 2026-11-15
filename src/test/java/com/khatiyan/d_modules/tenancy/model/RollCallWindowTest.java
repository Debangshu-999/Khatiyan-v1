package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

/** The roll call window (user, 2026-11-15): the owner's, minutes of the day, may cross midnight. */
class RollCallWindowTest {

    private static LocalDateTime at(int day, int hour, int minute) {
        return LocalDateTime.of(2026, 11, day, hour, minute);
    }

    @Test
    void sameDayWindowIsOpenInsideOnly() {
        RollCallWindow window = RollCallWindow.of(20 * 60, 23 * 60);

        assertThat(window.isOpen(at(15, 21, 30))).isTrue();
        assertThat(window.isOpen(at(15, 23, 0))).isFalse();
        assertThat(window.isOpen(at(15, 19, 59))).isFalse();
        assertThat(window.nightOf(at(15, 21, 30))).isEqualTo(LocalDate.of(2026, 11, 15));
    }

    @Test
    void midnightWindowBelongsToTheNightItOpened() {
        RollCallWindow window = RollCallWindow.of(21 * 60, 60);

        assertThat(window.isOpen(at(16, 0, 30))).isTrue();
        assertThat(window.nightOf(at(16, 0, 30))).isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(window.isOpen(at(15, 21, 15))).isTrue();
        assertThat(window.nightOf(at(15, 21, 15))).isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(window.isOpen(at(16, 1, 0))).isFalse();
        // In the day, before it opens, the night is today's.
        assertThat(window.nightOf(at(16, 14, 0))).isEqualTo(LocalDate.of(2026, 11, 16));
    }

    @Test
    void ofRefusesEqualOrMissingOrOutOfRange() {
        assertThat(RollCallWindow.of(600, 600)).isNull();
        assertThat(RollCallWindow.of(null, 60)).isNull();
        assertThat(RollCallWindow.of(0, 1440)).isNull();
        assertThat(RollCallWindow.of(-1, 60)).isNull();
    }
}
