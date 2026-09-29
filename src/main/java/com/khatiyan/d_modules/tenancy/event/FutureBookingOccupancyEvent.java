package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

/** Swaps a held post-transfer bed for actual occupancy when its booking starts. */
public record FutureBookingOccupancyEvent(UUID propertyId, UUID roomId) {}
