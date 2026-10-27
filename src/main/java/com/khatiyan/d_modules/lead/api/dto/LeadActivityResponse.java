package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;

/** One entry of a lead's timeline. */
public record LeadActivityResponse(
        UUID id,
        LeadActivityType type,
        UUID actorUserId,
        String actorName,
        UUID subjectUserId,
        String subjectName,
        UUID enquiryId,
        String detail,
        // The booking this entry is a step of. Null for everything else.
        UUID bookingRequestId,
        Instant occurredAt) {

    public static LeadActivityResponse of(LeadActivity activity, String actorName, String subjectName) {
        return new LeadActivityResponse(
                activity.getId(),
                activity.getType(),
                activity.getActorUserId(),
                actorName,
                activity.getSubjectUserId(),
                subjectName,
                activity.getEnquiryId(),
                activity.getDetail(),
                activity.getBookingRequestId(),
                activity.getOccurredAt());
    }
}
