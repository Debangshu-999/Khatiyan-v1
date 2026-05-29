package com.khatiyan.d_modules.property.event;

import java.util.UUID;

/**
 * Published when an owner assigns a manager to a property.
 */
public record ManagerAssignedEvent(
    UUID propertyId,
    UUID managerUserId,
    UUID assignedByUserId
) {
}
