package com.khatiyan.d_modules.property.api.dto;

import java.util.Set;

import com.khatiyan.d_modules.property.model.RoomAmenity;

/**
 * One room's own amenity list, diverging from its mold's.
 *
 * <p>Null sets are treated as empty rather than "leave alone": this replaces
 * the list wholesale, and a partial update would make removing the last amenity
 * impossible to express.
 */
public record UpdateRoomAmenitiesRequest(Set<RoomAmenity> amenities, Set<String> customAmenities) {
}
