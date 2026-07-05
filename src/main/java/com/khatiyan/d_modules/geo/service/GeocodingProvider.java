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
}
