package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

/**
 * Published when a tenant reopens a resolved concern.
 */
public record ConcernReopenedEvent(
    UUID concernId,
    UUID propertyId,
    UUID raisedByUserId,
    UUID assignedToUserId,
    String title
) {
}
