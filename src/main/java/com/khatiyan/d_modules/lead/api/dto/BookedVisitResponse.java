package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Visit;

/**
 * A booked visit, keyed by the enquiry it was booked on: what the Enquiries
 * card needs to say "Manage visit" instead of "Schedule visit".
 *
 * <p>The same for everyone who reads it. What the reader may do with the visit
 * is asked when they open it ({@code chat-actions}), so this list stays one
 * query however many cards it serves.
 *
 * @param upcoming            still to happen
 * @param missed              nobody checked them in by midnight
 * @param state               booked, attended or missed
 * @param rescheduled         whether it was moved on or after the day it was
 *                            due: the card then reads "Visit rescheduled"
 * @param managementMayChange whether the property may still move or cancel it:
 *                            until two hours before its slot (2026-10-04). Past
 *                            that the card shows the visit as data only
 */
public record BookedVisitResponse(
        UUID enquiryId,
        UUID visitId,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        boolean upcoming,
        boolean missed,
        VisitCardState state,
        boolean rescheduled,
        boolean managementMayChange) {

    public static BookedVisitResponse of(Visit visit, LocalDateTime now, ZoneId zone) {
        LocalDate today = now.toLocalDate();
        return new BookedVisitResponse(
                visit.getEnquiryId(),
                visit.getId(),
                visit.getVisitDate(),
                visit.getSlotStart(),
                visit.getSlotEnd(),
                visit.isUpcoming(today),
                visit.isMissed(today),
                VisitCardState.of(visit, today),
                visit.wasRescheduledOnOrAfterItsDay(zone),
                visit.managementMayChange(now));
    }
}
