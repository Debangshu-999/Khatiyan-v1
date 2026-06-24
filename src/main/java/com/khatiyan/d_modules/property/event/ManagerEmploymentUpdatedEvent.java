package com.khatiyan.d_modules.property.event;

import java.util.UUID;

/**
 * Published when an owner edits a manager's employment details. The affected
 * manager is notified personally.
 */
public record ManagerEmploymentUpdatedEvent(
    UUID propertyId,
    UUID managerUserId,
    UUID actorUserId
) {
}
