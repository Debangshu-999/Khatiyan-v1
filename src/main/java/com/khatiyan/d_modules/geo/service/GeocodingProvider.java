package com.khatiyan.d_modules.geo.service;

import java.util.List;
import java.util.Optional;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;

/**
 * Low-level contract for one geocoding vendor (mirrors the OTP delivery
 * provider pattern). Implementations must degrade gracefully — a vendor error
 * returns an empty result, never an exception, so the picker UI can show
 * "no results" instead of breaking.
 */
public interface GeocodingProvider {

    GeocodingProviderType type();

    /**
     * Autocomplete candidates for a typed query, optionally biased towards a
     * point so nearby matches rank first.
     */
    List<GeoSuggestionResponse> search(String query, Double nearLatitude, Double nearLongitude);

    /** Structured address for a map point. */
    Optional<ReverseGeocodeResponse> reverse(double latitude, double longitude);

    /**
     * Every place of one KIND within a radius — metro stations, hospitals,
     * colleges — rather than places matching a typed name.
     *
     * <p>Defaults to empty, which reads as "this vendor cannot do it". A
     * caller that finds nothing simply has no landmarks to measure against and
     * says so, so a vendor without a places catalogue degrades to the same
     * behaviour as one that is switched off.
     *
     * @param category      the vendor's own category identifier
     * @param radiusMeters  how far around the point to look
     */
    default List<GeoSuggestionResponse> places(
            String category, double latitude, double longitude, int radiusMeters, int limit) {
        return List.of();
    }
}
