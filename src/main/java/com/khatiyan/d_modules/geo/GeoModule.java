package com.khatiyan.d_modules.geo;

import java.util.List;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
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
}
