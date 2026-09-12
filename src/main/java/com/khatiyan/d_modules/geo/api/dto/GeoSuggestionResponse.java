package com.khatiyan.d_modules.geo.api.dto;

/**
 * One autocomplete candidate for a typed location query. Same-named places are
 * disambiguated by the {@code address} line (locality, city, state and usually
 * the pincode) — e.g. two "Gachibowli" entries with different pincodes. Picking
 * a suggestion recenters the map at ({@code latitude}, {@code longitude}); the
 * structured address form is then filled by a reverse geocode at that point.
 * {@code pincode} is a best-effort extract from the address line.
 *
 * <p><b>Coordinates may be null from Mappls</b>, whose autosuggest returns only
 * its own place code on a standard key. Mappls is used for smart search's named
 * landmarks alone; every screen that needs a point stays on Geoapify.
 *
 * @param distanceMeters straight-line distance from the point the search was biased
 *                       to, when the provider reports it. Mappls does, and it is
 *                       what lets a place located some other way be checked
 */
public record GeoSuggestionResponse(
    String name,
    String address,
    Double latitude,
    Double longitude,
    String pincode,
    String placeType,
    String providerPlaceId,
    Integer distanceMeters
) {
}
