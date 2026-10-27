package com.khatiyan.d_modules.booking.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomType;

/**
 * A room with a bed free today, for the person offering a tenant another bed
 * to choose from.
 *
 * <p>It exists so that a manager who handles bookings can pick a bed without
 * being given the property's whole rooms screen, which is a separate grant.
 * It says what the offer needs and nothing about who lives in the room.
 */
public record BookingBedOptionResponse(UUID roomId, String roomNumber, String floor, RoomType roomType,
        RoomConditioning conditioning, int capacity, long listedRentPaise, int freeBeds,
        /** The same type and AC as the room they booked: offered first (user, 2026-10-27). */
        boolean sameKind) {
}
