package com.khatiyan.d_modules.staff.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Weekday working pattern for daily-wage staff, encoded as a 7-bit mask where
 * bit {@code (DayOfWeek.getValue() - 1)} is set when the worker is on duty that
 * day — Monday = bit 0 ... Sunday = bit 6. {@link #ALL_DAYS} (127) means every
 * day of the week. Only meaningful for DAILY staff; monthly staff keep it at
 * {@code ALL_DAYS}.
 */
public final class WorkingDays {

    public static final int ALL_DAYS = 0b1111111; // 127

    private WorkingDays() {
    }

    /** Clamps an incoming mask to a valid 1..127 range, defaulting to all days. */
    public static int normalize(int mask) {
        return (mask <= 0 || mask > ALL_DAYS) ? ALL_DAYS : mask;
    }

    public static boolean worksOn(int mask, DayOfWeek day) {
        return (normalize(mask) & (1 << (day.getValue() - 1))) != 0;
    }

    /** Number of working days that fall in the given calendar month. */
    public static int countInMonth(int mask, YearMonth month) {
        int effective = normalize(mask);
        int count = 0;
        LocalDate day = month.atDay(1);
        LocalDate end = month.atEndOfMonth();
        while (!day.isAfter(end)) {
            if ((effective & (1 << (day.getDayOfWeek().getValue() - 1))) != 0) {
                count++;
            }
            day = day.plusDays(1);
        }
        return count;
    }
}
