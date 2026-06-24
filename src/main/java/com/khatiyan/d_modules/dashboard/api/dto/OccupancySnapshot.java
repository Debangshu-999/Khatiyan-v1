package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Occupancy rollup for a single property. Beds are counted by room capacity.
 * {@code unavailableRooms} counts rooms with no remaining capacity (fully
 * occupied).
 */
public record OccupancySnapshot(
    long activeTenants,
    long totalBeds,
    long occupiedBeds,
    long vacantBeds,
    long roomCount,
    long unavailableRooms
) {
}
