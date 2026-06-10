package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Occupancy rollup for a single property. Beds are counted by room capacity.
 */
public record OccupancySnapshot(
    long activeTenants,
    long totalBeds,
    long occupiedBeds,
    long vacantBeds,
    long roomCount
) {
}
