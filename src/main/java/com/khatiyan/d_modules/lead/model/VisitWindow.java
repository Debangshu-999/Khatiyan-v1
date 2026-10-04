package com.khatiyan.d_modules.lead.model;

/**
 * Where a visit stands for the person coming, by the clock (user, 2026-10-04).
 * It decides whether they may move it, and what the move costs them.
 */
public enum VisitWindow {

    /** Before its day. A move is one of their two. */
    BEFORE_DAY,

    /** Its day, before their slot starts. Another slot that day is free, another day is one of their two. */
    DAY_BEFORE_SLOT,

    /**
     * Their slot has started and less than half of it has gone. It moves as it
     * did before the slot started (user, 2026-10-04): it used to be held here.
     */
    IN_SLOT,

    /**
     * Half the slot has gone and nobody has checked them in. A later slot that
     * day is free. Another day is a genuine miss, and one of their two missed
     * moves. It lasts until midnight, the slot having ended or not.
     */
    RUNNING_LATE,

    /** Not checked in by midnight: No visit. A move is one of their two missed moves. */
    MISSED,

    /** Attended or cancelled. Nothing to move. */
    CLOSED;

    /** The visit's own day, with the visit still to happen: another slot that day costs the visitor nothing. */
    public boolean onTheDay() {
        return this == DAY_BEFORE_SLOT || this == IN_SLOT || this == RUNNING_LATE;
    }
}
