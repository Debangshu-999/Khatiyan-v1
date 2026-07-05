package com.khatiyan.d_modules.geo.service.providers;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingProvider;
import com.khatiyan.d_modules.geo.service.GeocodingProviderType;

import lombok.extern.slf4j.Slf4j;

/**
 * Keyless dev fallback: logs the call and returns empty results, so the app
 * boots and the picker degrades to manual address entry until a real provider
 * is configured via {@code app.geo.provider}.
 */
@Slf4j
@Component
public class DevLogGeocodingProvider implements GeocodingProvider {

    @Override
    public GeocodingProviderType type() {
        return GeocodingProviderType.LOG;
    }

    @Override
    public List<GeoSuggestionResponse> search(String query, Double nearLatitude, Double nearLongitude) {
        log.info("[DEV GEO] search query='{}' near=({}, {}) — set app.geo.provider=mappls for live results",
                query, nearLatitude, nearLongitude);
        return List.of();
    }

    @Override
    public Optional<ReverseGeocodeResponse> reverse(double latitude, double longitude) {
        log.info("[DEV GEO] reverse ({}, {}) — set app.geo.provider=mappls for live results", latitude, longitude);
        return Optional.empty();
    }
}
