package com.khatiyan.d_modules.enquiry;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * What this module needs to know about visits, which the leads pipeline books
 * and keeps.
 *
 * <p>Declared here and implemented there, because the pipeline already depends
 * on this module and a call the other way would be a cycle. Read when an
 * enquiry's window closes, to say why it ended, and by the enquirer's own list.
 */
public interface EnquiryVisitLookup {

    EnquiryVisitState stateOf(UUID enquiryId);

    /** The visit still booked on each of these enquiries, if any. One read for all of them. */
    Map<UUID, BookedVisit> bookedOn(Collection<UUID> enquiryIds);

    /** The latest cancelled visit on each of these enquiries, if any. One read for all of them. */
    Map<UUID, CancelledVisit> lastCancelledOn(Collection<UUID> enquiryIds);

    /**
     * The visit that stands on each of these enquiries, if any: booked,
     * attended or missed, never a cancelled one. One read for all of them. For
     * the enquirer's own list, which shows their pass and what to do next.
     */
    Map<UUID, StandingVisit> standingOn(Collection<UUID> enquiryIds);

    record BookedVisit(LocalDate date, LocalTime start) {}

    /**
     * @param passOpensAt     from when the visitor's pass shows
     * @param runningLateFrom half the slot gone: from here, unchecked, they are running late
     * @param answerBy        for a No visit, until when they may still move it. Null otherwise
     */
    record StandingVisit(
            UUID visitId,
            EnquiryVisitState state,
            LocalDate date,
            LocalTime start,
            LocalTime end,
            Instant passOpensAt,
            Instant slotStartsAt,
            Instant runningLateFrom,
            Instant slotEndsAt,
            Instant checkedInAt,
            Instant noVisitAt,
            Instant answerBy,
            long version) {}

    /** @param reason null on visits cancelled before reasons were asked for */
    record CancelledVisit(String reason, boolean byTenant, Instant cancelledAt) {}
}
