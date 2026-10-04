package com.khatiyan.d_modules.lead.api.dto;

import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.VisitWindow;

/**
 * Where a visit may be moved to right now, for the person asking (user,
 * 2026-10-04). The screen offers exactly these and works no rule out itself.
 *
 * @param refusal         why it cannot be moved, in words to show. Null when it can
 * @param anotherDayRefusal why it cannot go to another day, when a slot on its
 *                        own day is all that is left to it. Null when another day is on offer
 * @param todayIsFree     whether a slot on the visit day itself costs the visitor nothing
 * @param reschedulesLeft the visitor's counted moves left, from the count that applies now
 * @param days            the dates and slots on offer. Today first when a slot is still free today
 */
public record VisitMoveOptionsResponse(
        UUID visitId,
        VisitWindow window,
        String refusal,
        String anotherDayRefusal,
        boolean todayIsFree,
        int reschedulesLeft,
        List<VisitAvailabilityResponse.Day> days) {
}
