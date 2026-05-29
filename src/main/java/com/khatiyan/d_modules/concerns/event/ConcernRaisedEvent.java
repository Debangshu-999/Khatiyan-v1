package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

/**
 * Published when a tenant raises a new concern.
 */
public record ConcernRaisedEvent(
    UUID concernId,
    UUID propertyId,
    UUID raisedByUserId,
    String title
) {
}
