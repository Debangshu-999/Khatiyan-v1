package com.khatiyan.d_modules.geo.api.dto;

/**
 * A place of one kind, and how far it is from a given point.
 *
 * <p>No coordinates, because the vendor that answers this — Mappls Nearby —
 * does not return them on a standard key. For a listing card that does not
 * matter: the distance is measured by the vendor from the point we asked
 * about, which is the one number the card shows.
 *
 * <p>A MAP needs more than a distance, which is what {@code eLoc} is for.
 * Mappls' own place code is the only handle it gives out, and the native SDK
 * will drop a pin from one — {@code PointAnnotation mapplsPin="HWEAC2"} was
 * verified on device. Without it a type search could be listed but never
 * plotted.
 *
 * @param distanceMeters straight-line distance from the reference point
 * @param eLoc Mappls place code, null when the vendor omits it
 */
public record NearbyPlaceResponse(String name, String address, int distanceMeters, String eLoc) {
}
