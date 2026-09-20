package com.khatiyan.d_modules.geo.service;

import java.util.List;
import java.util.Optional;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.NearbyPlaceResponse;
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
     * Whether this vendor has what it needs to answer at all.
     *
     * <p>Lets a lookup chain skip a vendor that is present in the code but
     * has no credentials yet, instead of calling it, logging a warning, and
     * getting nothing back on every single search.
     */
    default boolean isConfigured() {
        return true;
    }

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

    /**
     * Places of the given categories nearest to a point, each with its distance
     * from that point, nearest first.
     *
     * <p>An empty OPTIONAL means the vendor did not answer — not configured,
     * refused the call, or errored. An empty LIST inside it means the vendor
     * answered and there is genuinely nothing of that kind in range.
     *
     * <p>The distinction exists so the caller can tell a fact from a failure.
     * Both used to arrive as an empty list, and the answer was cached for a
     * month either way — so one refused call taught the system that a property
     * has no metro station, and kept saying so long after the call would have
     * succeeded.
     */
    default Optional<List<NearbyPlaceResponse>> nearby(
            String categoryCodes, double latitude, double longitude, int radiusMeters) {
        return Optional.empty();
    }

    /**
     * The centre of an Indian pincode, as {latitude, longitude}. Empty means this
     * vendor cannot place it.
     */
    default Optional<double[]> postcodeCentroid(String pincode) {
        return Optional.empty();
    }
}
