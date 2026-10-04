package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;

/** What a visit card says about its visit (user, 2026-10-04). Never a cancelled one: those are not listed. */
public enum VisitCardState {

    /** Booked and still to happen, today included. */
    SCHEDULED,

    /** The visitor was checked in. */
    VISITED,

    /** Nobody checked them in by midnight: No visit. */
    MISSED,

    /**
     * Moved to another day. Only on the list of the day it left, under the
     * slot it left: the visit itself is in Upcoming, as scheduled.
     */
    RESCHEDULED;

    public static VisitCardState of(Visit visit, LocalDate today) {
        if (visit.getStatus() == VisitStatus.VISITED) {
            return VISITED;
        }
        return visit.isMissed(today) ? MISSED : SCHEDULED;
    }
}
