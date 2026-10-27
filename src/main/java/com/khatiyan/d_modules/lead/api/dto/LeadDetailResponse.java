package com.khatiyan.d_modules.lead.api.dto;

import java.util.List;
import java.util.UUID;

/**
 * One lead with everything gathered under it.
 *
 * @param timeline   newest entry first
 * @param enquiryIds every enquiry the person raised under this record, first to last
 * @param enquiries  the same enquiries in a line each, first to last
 * @param visits     newest first
 * @param bookings   first to last
 * @param cameBackAs the later record this person opened here after this one
 *                   ended, where they came back
 */
public record LeadDetailResponse(
        LeadResponse lead,
        List<LeadActivityResponse> timeline,
        List<UUID> enquiryIds,
        List<LeadEnquiryRef> enquiries,
        List<LeadVisitRef> visits,
        List<LeadBookingRef> bookings,
        LeadLinkRef cameBackAs) {
}
