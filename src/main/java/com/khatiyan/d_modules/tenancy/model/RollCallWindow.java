package com.khatiyan.d_modules.tenancy.model;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * The roll call window (user, 2026-11-15): set by the owner, no default, in
 * minutes of the day. It may run past midnight (9 pm to 1 am), and then the
 * hours after midnight belong to the night it opened on.
 */
public record RollCallWindow(int startMinute, int endMinute) {

    private static final int DAY = 24 * 60;

    /** The window, or null when it is not set, empty, or out of the day. */
    public static RollCallWindow of(Integer start, Integer end) {
        if (start == null || end == null || start.equals(end)
                || start < 0 || start >= DAY || end < 0 || end >= DAY) {
            return null;
        }
        return new RollCallWindow(start, end);
    }

    public boolean crossesMidnight() {
        return endMinute < startMinute;
    }

    /** Whether marking is open at this moment, read in India. */
    public boolean isOpen(LocalDateTime nowIst) {
        int minute = nowIst.getHour() * 60 + nowIst.getMinute();
        return crossesMidnight()
                ? minute >= startMinute || minute < endMinute
                : minute >= startMinute && minute < endMinute;
    }

    /**
     * The night a moment belongs to. Past midnight and before a midnight-crossing
     * window closes, it is the night before. Any other time, today's.
     */
    public LocalDate nightOf(LocalDateTime nowIst) {
        int minute = nowIst.getHour() * 60 + nowIst.getMinute();
        return crossesMidnight() && minute < endMinute
                ? nowIst.toLocalDate().minusDays(1)
                : nowIst.toLocalDate();
    }
}
