package com.khatiyan.d_modules.lead.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;

/**
 * What the action bar above an enquiry chat's message box shows, for the person
 * reading it.
 *
 * <p>Every "can" is decided here. The screen draws what it is told and never
 * works a rule out for itself, so it cannot offer something the server would
 * refuse.
 *
 * @param viewer             which side is reading
 * @param answered           whether the enquirer has been reached. The bar appears from then
 * @param ended              whether the conversation is over, by hand or by the enquiry's date
 * @param sentiment          the handler's reading. Always null for the enquirer
 * @param visit              the visit that stands in the way of booking another: one still to
 *                           happen, or one whose enquiry has not expired yet, even if it was missed
 * @param enquiryVersion     sent as If-Match with the sentiment and with ending
 */
public record EnquiryChatActionsResponse(
        UUID enquiryId,
        UUID propertyId,
        EnquiryParty viewer,
        boolean answered,
        boolean ended,
        EnquirySentiment sentiment,
        boolean canSetSentiment,
        boolean canScheduleVisit,
        boolean canEndConversation,
        // Management only: the enquirer changed their mind once, so marking
        // them Not interested again closes the enquiry.
        boolean notInterestedCloses,
        VisitResponse visit,
        long enquiryVersion) {
}
