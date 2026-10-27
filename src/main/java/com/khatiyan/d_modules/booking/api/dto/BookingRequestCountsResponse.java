package com.khatiyan.d_modules.booking.api.dto;

/**
 * How many of a property's requests and bookings are still going, by where
 * they stand. A request out of time is not counted, swept or not.
 *
 * @param awaitingHandler waiting on the property's answer
 * @param awaitingTenant  waiting on the tenant's answer
 * @param awaitingToken   terms agreed and the bed held, token not yet received
 * @param confirmed       confirmed bookings
 */
public record BookingRequestCountsResponse(
        long awaitingHandler, long awaitingTenant, long awaitingToken, long confirmed, long tokenReceived) {

    public long open() {
        return awaitingHandler + awaitingTenant + awaitingToken + confirmed + tokenReceived;
    }
}
