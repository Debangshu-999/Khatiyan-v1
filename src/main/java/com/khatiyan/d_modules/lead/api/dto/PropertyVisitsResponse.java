package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;

/**
 * The Manage Visits screen's three tabs (user, 2026-10-04).
 *
 * @param viewerIsOwner whether the person asking owns the property: only the
 *                      owner marks a missed check-in
 * @param todaySlots    every slot the property offers today, in order, whether
 *                      or not anyone is coming in it. The screen lists them
 *                      all and puts today's visits under theirs
 * @param today         every visit for today, by slot, checked in or not
 * @param upcoming      from tomorrow, soonest first
 * @param missed        No visits whose enquiry is still open, newest first.
 *                      Nothing here can be acted on by the property
 */
public record PropertyVisitsResponse(
        boolean viewerIsOwner,
        List<TodaySlot> todaySlots,
        List<VisitCardResponse> today,
        List<VisitCardResponse> upcoming,
        List<VisitCardResponse> missed) {

    /**
     * One of today's slots. The instants let the screen say whether it is
     * still to come, on now, or over, by its own clock.
     *
     * @param capacity how many visits the slot takes
     */
    public record TodaySlot(LocalTime start, LocalTime end, Instant startsAt, Instant endsAt, Integer capacity) {
    }
}
