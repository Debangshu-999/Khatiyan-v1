package com.khatiyan.d_modules.geo.api.dto;

/**
 * Structured address for a map point, used to prefill the (editable) address
 * form after the picker pin settles. Fields the provider cannot resolve are
 * null; {@code latitude}/{@code longitude} echo the queried point.
 */
public record ReverseGeocodeResponse(
    String formattedAddress,
    String street,
    String locality,
    String city,
    String district,
    String state,
    String pincode,
    double latitude,
    double longitude
) {
}
