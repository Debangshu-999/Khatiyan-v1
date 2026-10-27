package com.khatiyan.d_modules.booking.event;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A reminder to the property about a booking (2026-10-19): its turn before the
 * request runs out, a request or a token claim that has waited a day, a refund
 * it owes. The booking module chose who is told (the request's handler, or the
 * owner and the booking access list) and recorded that it was said. The
 * notification module turns it into the push and the in-app notice.
 *
 * @param kind REQUEST_YOUR_TURN, REQUEST_WAITING, TOKEN_CLAIM_WAITING or
 *             REFUND_OWED: the notification subtype without its BOOKING_
 */
public record BookingPropertyToldEvent(
        UUID requestId, List<UUID> recipientUserIds, String kind, String title, String body, Map<String, String> data) {

    public BookingPropertyToldEvent {
        recipientUserIds = List.copyOf(recipientUserIds);
        data = Map.copyOf(data);
    }
}
