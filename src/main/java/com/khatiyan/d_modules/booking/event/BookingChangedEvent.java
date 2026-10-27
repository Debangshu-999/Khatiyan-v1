package com.khatiyan.d_modules.booking.event;

import java.util.UUID;

/**
 * A booking changed: it was sent, answered, agreed, confirmed, handed to
 * someone, ended, or its stay began.
 *
 * <p>It says that something changed and for whom, never what. A listener reads
 * the booking as it stands now ({@code BookingModule.snapshotsForEnquiries})
 * and acts on that, so a repeated or late delivery changes nothing. The leads
 * pipeline is the listener it was made for.
 *
 * @param enquiryId the enquiry the booking was raised from, which is how a
 *                  lead finds it
 */
public record BookingChangedEvent(UUID requestId, UUID propertyId, UUID prospectUserId, UUID enquiryId) {
}
