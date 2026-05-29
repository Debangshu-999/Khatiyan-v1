package com.khatiyan.d_modules.property.event;

import java.util.UUID;

/**
 * Published when an owner removes a manager from a property.
 */
public record ManagerRemovedEvent(
    UUID propertyId,
    UUID managerUserId,
    UUID removedByUserId
) {
}
