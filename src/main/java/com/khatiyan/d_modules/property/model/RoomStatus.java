package com.khatiyan.d_modules.property.model;

/**
 * Current occupancy and availability state of a room.
 *
 * <p>Tenancy events move rooms between VACANT, PARTIALLY_OCCUPIED,
 * and OCCUPIED based on capacity. Owners can mark empty rooms as
 * MAINTENANCE to block new tenancies without deleting room history.
 */
public enum RoomStatus {
    VACANT,
    PARTIALLY_OCCUPIED,
    OCCUPIED,
    MAINTENANCE
}
