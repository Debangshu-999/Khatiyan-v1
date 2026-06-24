package com.khatiyan.d_modules.property.event;

import java.util.UUID;

/**
 * Published when a room changes its operational lifecycle state — taken on or
 * off maintenance, or deactivated / reactivated. Consumed by the notification
 * module to alert the property's management team.
 */
public record RoomLifecycleEvent(
    UUID propertyId,
    UUID roomId,
    String roomNumber,
    Kind kind,
    UUID actorUserId,
    String reason
) {

    public enum Kind {
        MAINTENANCE_STARTED,
        MAINTENANCE_ENDED,
        DEACTIVATED,
        REACTIVATED
    }
}
