package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.EnquiryVisitLookup;
import com.khatiyan.d_modules.enquiry.EnquiryVisitState;

/**
 * The enquirer's visit, on their own enquiry card (user, 2026-10-04): when the
 * pass opens, when they are running late, and for a No visit, until when they
 * may still move it. The moments are instants, so the screen compares them with
 * its own clock and needs no time zone.
 *
 * @param state SCHEDULED, VISITED or MISSED
 */
public record MyEnquiryVisitView(
        UUID visitId,
        EnquiryVisitState state,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        Instant passOpensAt,
        Instant slotStartsAt,
        Instant runningLateFrom,
        Instant slotEndsAt,
        Instant checkedInAt,
        Instant noVisitAt,
        Instant answerBy,
        long version) {

    public static MyEnquiryVisitView of(EnquiryVisitLookup.StandingVisit visit) {
        return visit == null
                ? null
                : new MyEnquiryVisitView(
                        visit.visitId(), visit.state(), visit.date(), visit.start(), visit.end(),
                        visit.passOpensAt(), visit.slotStartsAt(), visit.runningLateFrom(), visit.slotEndsAt(),
                        visit.checkedInAt(), visit.noVisitAt(), visit.answerBy(), visit.version());
    }
}
