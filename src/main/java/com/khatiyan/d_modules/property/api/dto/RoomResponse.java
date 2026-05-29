package com.khatiyan.d_modules.property.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.property.model.Room;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;

/**
 * API representation of a room inside a property.
 */
public record RoomResponse(
    UUID id,
    UUID propertyId,
    String roomNumber,
    String floor,
    int capacity,
    int occupiedCount,
    int availableVacancies,
    RoomType roomType,
    RoomConditioning conditioning,
    long baseRentPaise,
    RoomStatus status,
    boolean active
) {

    public static RoomResponse from(Room room) {
        return new RoomResponse(
            room.getId(),
            room.getPropertyId(),
            room.getRoomNumber(),
            room.getFloor(),
            room.getCapacity(),
            room.getOccupiedCount(),
            room.getAvailableVacancies(),
            room.getRoomType(),
            room.getConditioning(),
            room.getBaseRent().paise(),
            room.getStatus(),
            room.isCurrentlyActive()
        );
    }
}
