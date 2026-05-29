package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

import com.khatiyan.d_modules.concerns.model.ConcernStatus;

/**
 * Published when a concern moves between active work states.
 */
public record ConcernStatusChangedEvent(
    UUID concernId,
    UUID propertyId,
    UUID raisedByUserId,
    UUID assignedToUserId,
    ConcernStatus status,
    String title
) {
}
