package com.khatiyan.d_modules.staff.event;

import java.util.UUID;

/** Published when a non-user staff member's employment is ended. */
public record StaffMemberEndedEvent(
    UUID propertyId,
    String staffName,
    String categoryName,
    UUID actorUserId
) {
}
