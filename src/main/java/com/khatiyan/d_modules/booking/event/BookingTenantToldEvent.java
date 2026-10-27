package com.khatiyan.d_modules.booking.event;

import java.util.Map;
import java.util.UUID;

/**
 * Something the tenant is to be told about their own booking (2026-10-18):
 * confirmed, the date moved, move-in tomorrow, cancelled, expired, or the bed
 * not free on the day. The booking module decides what is said and records
 * that it was said, so each is published once. The notification module turns
 * it into the push and the in-app notice. The mail goes beside it.
 *
 * @param kind  CONFIRMED, DATE_MOVED, MOVE_IN_TOMORROW, CANCELLED, EXPIRED or
 *              BED_NOT_READY: the notification subtype without its BOOKING_
 * @param data  what the notice row prints: the property, the room, the
 *              reference code, the dates
 */
public record BookingTenantToldEvent(
        UUID requestId, UUID tenantUserId, String kind, String title, String body, Map<String, String> data) {

    public BookingTenantToldEvent {
        data = Map.copyOf(data);
    }
}
