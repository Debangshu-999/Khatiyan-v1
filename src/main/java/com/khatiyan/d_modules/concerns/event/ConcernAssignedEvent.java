package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

/**
 * Published when a concern is assigned to an owner or manager.
 */
public record ConcernAssignedEvent(
    UUID concernId,
    UUID propertyId,
    UUID assignedToUserId,
    String title
) {
}
