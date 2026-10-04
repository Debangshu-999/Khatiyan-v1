package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.VisitCheckInMethod;
import com.khatiyan.d_modules.lead.model.VisitImpression;

/**
 * One visit on the Manage Visits screen (user, 2026-10-04).
 *
 * <p>The slot's start and end are sent as instants as well, so the screen
 * knows when Mark attendance opens and closes from its own clock, whatever
 * time zone the phone is in.
 *
 * @param checkedInByUserId who checked them in, so the card can say "you" to
 *                        that person and the name to everyone else
 * @param late            whether they were checked in past half the slot. Null
 *                        until checked in, and when the owner marked it afterwards
 * @param viewerFillsForm whether the person asking is in charge of the visit
 *                        form: they checked the visitor in, or they are the owner
 * @param noVisitAt       when the night's sweep marked it No visit
 * @param runningLateAt   when the visitor said they are running late
 * @param rescheduledToDate      for a Rescheduled card on the day it left: the
 *                               date it moved to. The card's own date and slot
 *                               are the ones it left
 * @param rescheduledToSlotStart and the slot it moved to
 * @param placedAt        when the visit took the date and slot it has now: when
 *                        it was booked, or last moved. The Upcoming tab counts
 *                        what was placed since it was last looked at
 * @param version         sent as If-Match with every action on the card
 */
public record VisitCardResponse(
        UUID visitId,
        String referenceCode,
        UUID enquiryId,
        String prospectName,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        Instant slotStartsAt,
        Instant slotEndsAt,
        VisitCardState state,
        Instant checkedInAt,
        UUID checkedInByUserId,
        String checkedInByName,
        VisitCheckInMethod checkInMethod,
        Boolean late,
        boolean formCompleted,
        boolean viewerFillsForm,
        LocalTime departedAt,
        Integer partySize,
        VisitImpression impression,
        UUID handlerUserId,
        String handlerName,
        Instant noVisitAt,
        Instant runningLateAt,
        LocalDate rescheduledToDate,
        LocalTime rescheduledToSlotStart,
        Instant placedAt,
        long version) {
}
