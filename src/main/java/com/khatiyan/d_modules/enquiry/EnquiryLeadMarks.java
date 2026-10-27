package com.khatiyan.d_modules.enquiry;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.api.dto.EnquiryRepeatMark;

/**
 * Whether an enquiry's person keeps walking away: the duplicate or potential
 * spam mark the leads pipeline puts on their record (user, 2026-10-17: "Show
 * the mark on the Enquiries screen too").
 *
 * <p>Declared here and implemented there, as {@link EnquiryVisitLookup} is:
 * the pipeline depends on this module, and a call the other way would be a
 * cycle.
 */
public interface EnquiryLeadMarks {

    /** The mark on the record of each of these enquiries that has one. One read for all of them. */
    Map<UUID, EnquiryRepeatMark> marksOn(Collection<UUID> enquiryIds);
}
