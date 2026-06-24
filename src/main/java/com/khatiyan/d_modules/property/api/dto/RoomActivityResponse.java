package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.RoomActivity;
import com.khatiyan.d_modules.property.model.RoomActivityType;

/**
 * API representation of one recorded room lifecycle action, with the actor's
 * display name resolved by the service layer.
 */
public record RoomActivityResponse(
    UUID roomId,
    String roomNumber,
    RoomActivityType type,
    String reason,
    UUID actorUserId,
    String actorName,
    Instant occurredAt
) {

    public static RoomActivityResponse from(RoomActivity activity, String actorName) {
        return new RoomActivityResponse(
            activity.getRoomId(),
            activity.getRoomNumber(),
            activity.getActivityType(),
            activity.getReason(),
            activity.getActorUserId(),
            actorName,
            activity.getOccurredAt()
        );
    }
}
