package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadKind;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;

/**
 * One pipeline record as management reads it.
 *
 * <p>No phone number. Contact details are the enquiry's to share, under the
 * consent the person gave there.
 *
 * @param referenceCode the short code shown to people ({@code LEAD-2026-000123}), never the id
 * @param kind          what it is to the owner: an enquiry, a lead at one of
 *                      its stages, converted, dead, or a lost enquiry
 * @param stage         the furthest it is at now. A dead lead keeps the stage it died at
 * @param becameLeadAt  the first time a visit was scheduled. Null for one that never was a lead
 * @param resumed       this person came back: the record follows an earlier
 *                      one of theirs here, or was opened again by "Changed your mind?"
 * @param resumedFrom   the earlier record, where this is a new one
 * @param repeat        null unless the person walked away from earlier
 *                      records here: a duplicate, or potential spam, with why
 * @param goingCold     null unless something on an open lead runs out soon or waits on the property
 * @param visit         its latest visit, if it has had one
 * @param booking       its live booking, or else the last one it had
 * @param bookingWindowEndsAt when the days to ask for a booking after the
 *                      attended visit run out. Null unless they are still open
 * @param followUpEnquiryId the enquiry still open to follow up on, the latest
 *                      if more than one. Null when none is
 * @param viewerMayFollowUp whether the person reading may follow up on it: the
 *                      owner, its handler, or anyone while it has none
 * @param version       sent back with a write, so one built on an older read is refused
 */
public record LeadResponse(
        UUID id,
        String referenceCode,
        UUID propertyId,
        UUID prospectUserId,
        String prospectName,
        UUID enquiryId,
        LeadKind kind,
        LeadStage stage,
        LeadState state,
        LeadCloseReason closeReason,
        Instant closedAt,
        UUID handlerUserId,
        String handlerName,
        LeadHandlerSource handlerAssignedBy,
        Instant handlerAssignedAt,
        Instant enquiredAt,
        Instant respondedAt,
        Instant becameLeadAt,
        Instant earlyLeadAt,
        Instant advancedLeadAt,
        Instant bookedAt,
        Instant movedInAt,
        UUID convertedTenancyId,
        boolean resumed,
        LeadLinkRef resumedFrom,
        Instant reopenedAt,
        LeadRepeatResponse repeat,
        LeadGoingColdResponse goingCold,
        LeadVisitRef visit,
        LeadBookingRef booking,
        Instant bookingWindowEndsAt,
        UUID followUpEnquiryId,
        boolean viewerMayFollowUp,
        long version,
        // Someone recorded outside the app: no account, nothing sent to them (2026-10-19).
        boolean external) {

    public static LeadResponse of(
            Lead lead, String prospectName, String handlerName, LeadLinkRef resumedFrom, LeadRepeatResponse repeat,
            LeadGoingColdResponse goingCold, LeadVisitRef visit, LeadBookingRef booking,
            Instant bookingWindowEndsAt, UUID followUpEnquiryId, boolean viewerMayFollowUp) {
        return new LeadResponse(
                lead.getId(),
                lead.getReferenceCode(),
                lead.getPropertyId(),
                lead.getProspectUserId(),
                prospectName,
                lead.getEnquiryId(),
                LeadKind.of(lead),
                lead.getStage(),
                lead.getState(),
                lead.getCloseReason(),
                lead.getClosedAt(),
                lead.getHandlerUserId(),
                handlerName,
                lead.getHandlerAssignedBy(),
                lead.getHandlerAssignedAt(),
                lead.getEnquiredAt(),
                lead.getRespondedAt(),
                lead.getBecameLeadAt(),
                lead.getEarlyLeadAt(),
                lead.getAdvancedLeadAt(),
                lead.getBookedAt(),
                lead.getMovedInAt(),
                lead.getConvertedTenancyId(),
                lead.isResumed(),
                resumedFrom,
                lead.getReopenedAt(),
                repeat,
                goingCold,
                visit,
                booking,
                bookingWindowEndsAt,
                followUpEnquiryId,
                viewerMayFollowUp,
                lead.getVersion(),
                lead.isExternal());
    }
}
