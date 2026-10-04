package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.VisitCheckInMethod;

/**
 * One of the visitor's own visits, on My visits (user, 2026-10-04).
 *
 * <p>The moments are instants, compared with the phone's own clock: when the
 * pass opens, when they are running late, when the slot ends.
 *
 * @param directionsUrl a Google Maps link with the property as the destination
 *                    and no origin, so the app starts from where the visitor is.
 *                    Null when the property has neither an address nor a pin
 * @param passClosesAt midnight at the end of the visit's day: the pass shows until then
 * @param checkedInByName who received them at the property, once checked in
 * @param checkInMethod how: their pass scanned, its code typed, or the owner
 *                    marking it after the slot
 * @param late        whether they were checked in past half the slot. Null until
 *                    checked in, and when the owner marked it afterwards
 * @param answerBy    for a No visit, until when "Are you still interested?" is
 *                    open. Null otherwise
 * @param runningLateAt when they said "I'm on my way". The screen stops asking then
 * @param enquiryOpen whether its enquiry is still open. Once it is not, nothing
 *                    more can be done with the visit
 * @param version     sent as If-Match when moving or cancelling it
 */
public record MyVisitResponse(
        UUID visitId,
        String referenceCode,
        UUID enquiryId,
        UUID propertyId,
        String propertyName,
        String directionsUrl,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        VisitCardState state,
        Instant passOpensAt,
        Instant passClosesAt,
        Instant slotStartsAt,
        Instant runningLateFrom,
        Instant slotEndsAt,
        Instant checkedInAt,
        String checkedInByName,
        VisitCheckInMethod checkInMethod,
        Boolean late,
        Instant noVisitAt,
        Instant answerBy,
        Instant runningLateAt,
        boolean enquiryOpen,
        long version) {
}
