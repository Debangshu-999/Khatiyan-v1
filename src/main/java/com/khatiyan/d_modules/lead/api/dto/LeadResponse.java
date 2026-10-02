package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;

/**
 * One pipeline record as management reads it.
 *
 * <p>No phone number. Contact details are the enquiry's to share, under the
 * consent the person gave there.
 *
 * @param referenceCode the short code shown to people ({@code LEAD-2026-000123}), never the id
 * @param version       for the writes later phases add
 */
public record LeadResponse(
        UUID id,
        String referenceCode,
        UUID propertyId,
        UUID prospectUserId,
        String prospectName,
        UUID enquiryId,
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
        Instant earlyLeadAt,
        Instant advancedLeadAt,
        Instant bookedAt,
        Instant movedInAt,
        UUID convertedTenancyId,
        long version) {

    public static LeadResponse of(Lead lead, String prospectName, String handlerName) {
        return new LeadResponse(
                lead.getId(),
                lead.getReferenceCode(),
                lead.getPropertyId(),
                lead.getProspectUserId(),
                prospectName,
                lead.getEnquiryId(),
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
                lead.getEarlyLeadAt(),
                lead.getAdvancedLeadAt(),
                lead.getBookedAt(),
                lead.getMovedInAt(),
                lead.getConvertedTenancyId(),
                lead.getVersion());
    }
}
