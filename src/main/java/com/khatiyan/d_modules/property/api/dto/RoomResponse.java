package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;
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
    // Beds held for approved room changes that have not transferred yet.
    int reservedCount,
    int availableVacancies,
    RoomType roomType,
    RoomConditioning conditioning,
    long baseRentPaise,
    RoomStatus status,
    boolean active,
    String maintenanceReason,
    Instant maintenanceUntil,
    UUID maintenanceMarkedByUserId,
    String maintenanceMarkedByName,
    Instant maintenanceMarkedAt,
    Instant updatedAt
) {

    public static RoomResponse from(Room room) {
        return from(room, null);
    }

    /**
     * Builds a room response with the maintenance marker's display name
     * resolved by the caller (it lives in the auth module, not on the room).
     */
    public static RoomResponse from(Room room, String maintenanceMarkedByName) {
        return new RoomResponse(
            room.getId(),
            room.getPropertyId(),
            room.getRoomNumber(),
            room.getFloor(),
            room.getCapacity(),
            room.getOccupiedCount(),
            room.getReservedCount(),
            room.getAvailableVacancies(),
            room.getRoomType(),
            room.getConditioning(),
            room.getBaseRent().paise(),
            room.getStatus(),
            room.isCurrentlyActive(),
            room.getMaintenanceReason(),
            room.getMaintenanceUntil(),
            room.getMaintenanceMarkedBy(),
            maintenanceMarkedByName,
            room.getMaintenanceMarkedAt(),
            room.getUpdatedAt()
        );
    }
}
