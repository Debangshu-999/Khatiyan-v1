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

    record BookedVisit(LocalDate date, LocalTime start) {}

    /** @param reason null on visits cancelled before reasons were asked for */
    record CancelledVisit(String reason, boolean byTenant, Instant cancelledAt) {}
}
