package com.khatiyan.d_modules.staff.event;

import java.util.UUID;

/** Published when a non-user staff member is added to a property. */
public record StaffMemberAddedEvent(
    UUID propertyId,
    String staffName,
    String categoryName,
    UUID actorUserId
) {
}
