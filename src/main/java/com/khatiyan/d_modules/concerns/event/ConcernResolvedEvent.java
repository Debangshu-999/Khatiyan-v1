package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

/**
 * Published when a concern is resolved and enters the tenant reopen window.
 */
public record ConcernResolvedEvent(
    UUID concernId,
    UUID propertyId,
    UUID raisedByUserId,
    UUID resolvedByUserId,
    String title
) {
}
