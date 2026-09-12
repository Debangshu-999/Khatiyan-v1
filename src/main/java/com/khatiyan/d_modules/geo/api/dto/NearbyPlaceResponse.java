package com.khatiyan.d_modules.geo.api.dto;

/**
 * A place of one kind, and how far it is from a given point.
 *
 * <p>No coordinates, because the vendor that answers this — Mappls Nearby —
 * does not return them on a standard key. It does not need to: the distance is
 * measured by the vendor from the point that was asked about, which is the one
 * number a listing card shows.
 *
 * @param distanceMeters straight-line distance from the reference point
 */
public record NearbyPlaceResponse(String name, String address, int distanceMeters) {
}
