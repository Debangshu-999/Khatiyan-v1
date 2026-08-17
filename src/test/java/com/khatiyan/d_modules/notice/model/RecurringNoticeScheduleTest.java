package com.khatiyan.d_modules.notice.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * When a recurring template fires.
 *
 * <p>The schedule used to be inferred from {@code activeFrom}: WEEKLY took its
 * weekday, MONTHLY took its day-of-month. One field meaning three things is why
 * a monthly notice could only ever land on a single day, and why "starts on"
 * and "repeats on" could not be set independently. These tests pin the split.
 */
class RecurringNoticeScheduleTest {

    private static final LocalTime START = LocalTime.of(9, 0);
    private static final LocalTime END = LocalTime.of(18, 0);
    /** A Saturday, deliberately unrelated to the weekdays under test. */
    private static final LocalDate ACTIVE_FROM = LocalDate.of(2026, 8, 1);

    private static RecurringNotice template(
            RecurringNoticeFrequency frequency, Set<DayOfWeek> daysOfWeek, Set<Integer> daysOfMonth) {
        return RecurringNotice.create(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Water tanker",
                "Arrives in the morning.",
                NoticePriority.NORMAL,
                frequency,
                daysOfWeek,
                daysOfMonth,
                START,
                END,
                ACTIVE_FROM,
                null);
    }

    @Test
    void dailyFiresEveryDayInsideTheWindow() {
        RecurringNotice daily = template(RecurringNoticeFrequency.DAILY, null, null);

        assertThat(daily.shouldGenerateFor(LocalDate.of(2026, 8, 3))).isTrue();
        assertThat(daily.shouldGenerateFor(LocalDate.of(2026, 8, 4))).isTrue();
    }

    /** Before activeFrom nothing fires, whatever the schedule says. */
    @Test
    void nothingFiresBeforeTheStartDate() {
        RecurringNotice daily = template(RecurringNoticeFrequency.DAILY, null, null);

        assertThat(daily.shouldGenerateFor(ACTIVE_FROM.minusDays(1))).isFalse();
    }

    /**
     * The weekday is the chosen one, not the start date's.
     *
     * <p>{@code ACTIVE_FROM} is a Saturday and the template repeats on Tuesday;
     * under the old rule this fired on Saturdays.
     */
    @Test
    void weeklyFiresOnTheChosenWeekdayNotTheStartDates() {
        RecurringNotice weekly = template(RecurringNoticeFrequency.WEEKLY, Set.of(DayOfWeek.TUESDAY), null);

        assertThat(weekly.shouldGenerateFor(LocalDate.of(2026, 8, 4))).isTrue(); // Tuesday
        assertThat(weekly.shouldGenerateFor(LocalDate.of(2026, 8, 8))).isFalse(); // Saturday
    }

    /** "Every Monday and Tuesday" — the case a single weekday could not hold. */
    @Test
    void weeklyFiresOnEveryChosenWeekday() {
        RecurringNotice weekly = template(
                RecurringNoticeFrequency.WEEKLY, Set.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY), null);

        assertThat(weekly.shouldGenerateFor(LocalDate.of(2026, 8, 3))).isTrue(); // Monday
        assertThat(weekly.shouldGenerateFor(LocalDate.of(2026, 8, 4))).isTrue(); // Tuesday
        assertThat(weekly.shouldGenerateFor(LocalDate.of(2026, 8, 5))).isFalse(); // Wednesday
    }

    @Test
    void monthlyFiresOnEveryChosenDay() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(1, 15));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2026, 9, 1))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2026, 9, 15))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2026, 9, 16))).isFalse();
    }

    /**
     * A short month still gets its notice, on its last day.
     *
     * <p>Someone choosing the 31st means "the end of the month"; skipping
     * February entirely would drop a rent reminder once a year.
     */
    @Test
    void monthlyClampsAChosenDayOntoShorterMonths() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(31));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 28))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 27))).isFalse();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 3, 31))).isTrue();
    }

    /**
     * Two days near the end stay two days.
     *
     * <p>Clamping both onto the last day silently halved the schedule: a
     * template asking for the 30th and the 31st produced one notice in April,
     * not two, and one in February instead of two.
     */
    @Test
    void monthlyKeepsChosenDaysDistinctInShortMonths() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(30, 31));

        // April has 30 days — the last two are the 29th and the 30th.
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 4, 30))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 4, 29))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 4, 28))).isFalse();

        // February 2027 has 28 — the last two are the 27th and the 28th.
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 28))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 27))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 26))).isFalse();

        // A month long enough to hold both leaves them exactly where they were.
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 3, 30))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 3, 31))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 3, 29))).isFalse();
    }

    /**
     * February gains a day in a leap year, and the schedule follows it.
     *
     * <p>2028 is a leap year, so its February holds 29 days: the same template
     * that fires on the 27th and 28th in 2027 fires on the 28th and 29th here.
     * Nothing special-cases this — {@code lengthOfMonth} is the whole rule —
     * but it is the case most likely to be broken by a future "simplification"
     * to a fixed 28.
     */
    @Test
    void monthlyFollowsFebruaryIntoALeapYear() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(30, 31));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2028, 2, 29))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2028, 2, 28))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2028, 2, 27))).isFalse();
    }

    /** The last day of a leap February is the 29th, not the 28th. */
    @Test
    void monthlyLastDayIsTheTwentyNinthInALeapFebruary() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(31));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2028, 2, 29))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2028, 2, 28))).isFalse();
    }

    /** Three at the end become the last three, not all one day. */
    @Test
    void monthlyShiftsARunOfEndDaysTogether() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(29, 30, 31));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 28))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 27))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 26))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 25))).isFalse();
    }

    /** A day the month can hold is never moved to make room for one it cannot. */
    @Test
    void monthlyLeavesEarlyDaysWhereTheyAre() {
        RecurringNotice monthly = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(1, 31));

        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 1))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 28))).isTrue();
        assertThat(monthly.shouldGenerateFor(LocalDate.of(2027, 2, 27))).isFalse();
    }

    /** Switching frequency must not leave the old schedule behind to fire on. */
    @Test
    void clearsTheWeekdayWhenATemplateBecomesMonthly() {
        RecurringNotice template = template(RecurringNoticeFrequency.WEEKLY, Set.of(DayOfWeek.TUESDAY), null);

        template.updateDetails(
                "Water tanker",
                "Arrives in the morning.",
                NoticePriority.NORMAL,
                RecurringNoticeFrequency.MONTHLY,
                Set.of(),
                List.of(5),
                START,
                END,
                ACTIVE_FROM,
                null);

        assertThat(template.getDaysOfWeek()).isEmpty();
        assertThat(template.getDaysOfMonth()).containsExactly(5);
        assertThat(template.shouldGenerateFor(LocalDate.of(2026, 8, 4))).isFalse(); // Tuesday
        assertThat(template.shouldGenerateFor(LocalDate.of(2026, 8, 5))).isTrue();
    }

    @Test
    void clearsTheMonthDaysWhenATemplateBecomesDaily() {
        RecurringNotice template = template(RecurringNoticeFrequency.MONTHLY, null, Set.of(1, 15));

        template.updateDetails(
                "Water tanker",
                "Arrives in the morning.",
                NoticePriority.NORMAL,
                RecurringNoticeFrequency.DAILY,
                Set.of(),
                null,
                START,
                END,
                ACTIVE_FROM,
                null);

        assertThat(template.getDaysOfMonth()).isEmpty();
        assertThat(template.shouldGenerateFor(LocalDate.of(2026, 8, 7))).isTrue();
    }

    /** Refused rather than defaulted — a guessed weekday fires on nobody's chosen day. */
    @Test
    void refusesAWeeklyTemplateWithNoWeekday() {
        assertThatThrownBy(() -> template(RecurringNoticeFrequency.WEEKLY, Set.of(), null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("day of the week");
    }

    @Test
    void refusesAMonthlyTemplateWithNoDays() {
        assertThatThrownBy(() -> template(RecurringNoticeFrequency.MONTHLY, null, Set.of()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("day of the month");
    }

    @Test
    void refusesADayOutsideTheMonth() {
        assertThatThrownBy(() -> template(RecurringNoticeFrequency.MONTHLY, null, Set.of(32)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("between 1 and 31");
    }
}
