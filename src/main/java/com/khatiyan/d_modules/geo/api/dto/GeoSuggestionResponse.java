package com.khatiyan.d_modules.geo.api.dto;

/**
 * One autocomplete candidate for a typed location query. Same-named places are
 * disambiguated by the {@code address} line (locality, city, state and usually
 * the pincode) — e.g. two "Gachibowli" entries with different pincodes. Picking
 * a suggestion recenters the map at ({@code latitude}, {@code longitude}); the
 * structured address form is then filled by a reverse geocode at that point.
 * {@code pincode} is a best-effort extract from the address line.
 */
public record GeoSuggestionResponse(
    String name,
    String address,
    Double latitude,
    Double longitude,
    String pincode,
    String placeType,
    String providerPlaceId
) {
}
