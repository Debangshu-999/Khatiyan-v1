package com.khatiyan.d_modules.billing.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Where a monthly billing cycle starts and ends.
 *
 * <p><b>Anchored, not chained.</b> A cycle start is "the tenant's day, expressed
 * in this month" — never "the previous start plus a month". Chaining loses the
 * anchor the first time it clamps: 31 Jan + 1 month is 28 Feb, and every start
 * after that is derived from the 28th, so the tenancy silently becomes a 28th
 * tenancy forever. Measured before this existed:
 *
 * <pre>
 * chained:  31 Jan -> 28 Feb -> 28 Mar -> 28 Apr -> 28 May
 * anchored: 31 Jan -> 28 Feb -> 31 Mar -> 30 Apr -> 31 May
 * </pre>
 *
 * <p>Clamping here is a <i>rendering</i> of the anchor, not a change to it.
 * February is asked "what is day 31 of February" and answers 28; March asks the
 * same question of the anchor and answers 31. Nothing writes the clamped value
 * back, so there is nothing to recover from — and leap years need no special
 * case, because {@code lengthOfMonth()} already knows.
 *
 * <p>The anchor is not stored anywhere: it is the day-of-month of the tenancy's
 * start date, and {@code createFirstCycle} always opens the first cycle on that
 * date, so the two cannot disagree.
 */
final class MonthlyCycleDates {

    private MonthlyCycleDates() {
    }

    /**
     * The day of the month a tenancy bills on, taken from its start date.
     *
     * <p>Kept as the raw day (1..31), never the clamped one — clamping a stored
     * anchor is exactly the bug this class exists to prevent.
     */
    static int anchorDayOf(LocalDate tenancyStartDate) {
        return tenancyStartDate.getDayOfMonth();
    }

    /** The cycle start falling in {@code month}, clamped to that month's length. */
    static LocalDate startIn(YearMonth month, int anchorDay) {
        return month.atDay(Math.min(anchorDay, month.lengthOfMonth()));
    }

    /**
     * The start of the cycle following the one that begins on {@code start}.
     *
     * <p>Derived from the anchor and the next calendar month, so a clamped start
     * does not drag the next one down with it.
     */
    static LocalDate nextStartAfter(LocalDate start, int anchorDay) {
        return startIn(YearMonth.from(start).plusMonths(1), anchorDay);
    }

    /**
     * The last day of the cycle beginning on {@code start}.
     *
     * <p>Derived from the <b>next</b> start, not from {@code start} plus a month.
     * Those agree only while the anchor never recovers; the moment it does, the
     * old formula leaves a gap — 28 Feb would end on 27 Mar while the next cycle
     * began on 31 Mar, losing three unbilled days every year for every tenancy
     * anchored on the 29th to the 31st.
     */
    static LocalDate endOfCycleStartingOn(LocalDate start, int anchorDay) {
        return nextStartAfter(start, anchorDay).minusDays(1);
    }
}
