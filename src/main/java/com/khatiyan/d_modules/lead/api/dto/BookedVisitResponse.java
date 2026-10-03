package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;
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
 * @param upcoming still to happen
 * @param missed   its date passed without them coming
 */
public record BookedVisitResponse(
        UUID enquiryId,
        UUID visitId,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        boolean upcoming,
        boolean missed) {

    public static BookedVisitResponse of(Visit visit, LocalDate today) {
        return new BookedVisitResponse(
                visit.getEnquiryId(),
                visit.getId(),
                visit.getVisitDate(),
                visit.getSlotStart(),
                visit.getSlotEnd(),
                visit.isUpcoming(today),
                visit.isMissed(today));
    }
}
