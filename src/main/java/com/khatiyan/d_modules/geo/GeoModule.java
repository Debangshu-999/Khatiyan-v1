package com.khatiyan.d_modules.geo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingService;

/**
 * Public facade for the geo module. Other modules (the property and discovery
 * coordinate backfills) geocode through this instead of touching geo services
 * directly.
 */
@Component
public class GeoModule {

    private final GeocodingService geocodingService;

    public GeoModule(GeocodingService geocodingService) {
        this.geocodingService = geocodingService;
    }

    /** False while the keyless LOG fallback is active — jobs should skip work. */
    public boolean isLiveProvider() {
        return geocodingService.isLiveProvider();
    }

    /** Cache-backed forward geocode for internal jobs (no per-user rate limit). */
    public List<GeoSuggestionResponse> systemSearch(String query) {
        return geocodingService.systemSearch(query);
    }

    /**
     * What place a coordinate belongs to.
     *
     * <p>Exposed for smart search, which needs the region a resolved place sits
     * in — not to show it, but to scope the search to it. Sending a coordinate
     * without that scope once returned all-India results ranked by distance,
     * putting a Hyderabad listing in a Kolkata search, so every place-anchored
     * search has to carry the locality, city and state this returns.
     *
     * <p>Takes the actor because the underlying lookup is rate-limited per
     * person and cached per coordinate. A facade that hid that would let a
     * caller spend somebody else's allowance.
     *
     * @return empty when the coordinate resolves to nothing the provider knows
     */
    /**
     * Landmarks of one kind around a point, for a search that named a kind of
     * place rather than a place. Empty when the vendor cannot answer, which
     * callers must treat as "no landmarks to measure against" rather than as
     * an error.
     */
    /**
     * A named landmark, near a point — through the landmark lookup chain
     * (Mappls first when configured), not the everyday autocomplete provider.
     */
    public List<GeoSuggestionResponse> systemSearchNear(String query, double latitude, double longitude) {
        return geocodingService.landmarkSearch(query, latitude, longitude);
    }

    /** Whether nearest-place distances can be measured per point (Mappls configured). */
    public boolean canMeasureNearby() {
        return geocodingService.canMeasureNearby();
    }

    /**
     * Places of the given categories nearest a point, each with its distance
     * from that point, nearest first. Empty when nothing is within range or the
     * vendor is not configured.
     */
    public List<com.khatiyan.d_modules.geo.api.dto.NearbyPlaceResponse> nearby(
            String categoryCodes, double latitude, double longitude, int radiusMeters) {
        return geocodingService.nearby(categoryCodes, latitude, longitude, radiusMeters);
    }

    public List<GeoSuggestionResponse> places(
            String category, double latitude, double longitude, int radiusMeters, int limit) {
        return geocodingService.systemPlaces(category, latitude, longitude, radiusMeters, limit);
    }

    public Optional<ReverseGeocodeResponse> reverse(UUID actorUserId, double latitude, double longitude) {
        return geocodingService.reverse(actorUserId, latitude, longitude);
    }
}
