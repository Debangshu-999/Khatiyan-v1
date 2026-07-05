package com.khatiyan.d_modules.geo.service.providers;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingProvider;
import com.khatiyan.d_modules.geo.service.GeocodingProviderType;

import lombok.extern.slf4j.Slf4j;

/**
 * Geoapify adapter — the friction-free alternative to Mappls: one API key, no
 * OAuth, no IP allowlist, generous free tier. OSM-based, so Indian pincode
 * granularity is weaker than Mappls; results are filtered to India. Failures
 * log a warning and return empty results, never exceptions.
 */
@Slf4j
@Component
public class GeoapifyGeocodingProvider implements GeocodingProvider {

    private final RestClient restClient;
    private final String baseUrl;
    private final String apiKey;
    private final String countryFilter;

    public GeoapifyGeocodingProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.geo.geoapify.base-url:https://api.geoapify.com/v1/geocode}") String baseUrl,
            @Value("${app.geo.geoapify.api-key:}") String apiKey,
            @Value("${app.geo.geoapify.country-filter:countrycode:in}") String countryFilter) {
        this.restClient = restClientBuilder.build();
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.countryFilter = countryFilter;
    }

    @Override
    public GeocodingProviderType type() {
        return GeocodingProviderType.GEOAPIFY;
    }

    @Override
    public List<GeoSuggestionResponse> search(String query, Double nearLatitude, Double nearLongitude) {
        if (apiKey.isBlank()) {
            log.warn("Geoapify search skipped: API key not configured (app.geo.geoapify.api-key)");
            return List.of();
        }
        try {
            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString(baseUrl + "/autocomplete")
                    .queryParam("text", query)
                    .queryParam("limit", 6)
                    .queryParam("apiKey", apiKey);
            if (!countryFilter.isBlank()) {
                uri.queryParam("filter", countryFilter);
            }
            if (nearLatitude != null && nearLongitude != null) {
                uri.queryParam("bias", "proximity:" + nearLongitude + "," + nearLatitude);
            }
            JsonNode body = restClient.get().uri(uri.build().toUri()).retrieve().body(JsonNode.class);
            return parseSuggestions(body);
        } catch (RuntimeException exception) {
            log.warn("Geoapify autocomplete failed query='{}'", query, exception);
            return List.of();
        }
    }

    @Override
    public Optional<ReverseGeocodeResponse> reverse(double latitude, double longitude) {
        if (apiKey.isBlank()) {
            log.warn("Geoapify reverse skipped: API key not configured (app.geo.geoapify.api-key)");
            return Optional.empty();
        }
        try {
            String url = UriComponentsBuilder.fromUriString(baseUrl + "/reverse")
                    .queryParam("lat", latitude)
                    .queryParam("lon", longitude)
                    .queryParam("limit", 1)
                    .queryParam("apiKey", apiKey)
                    .build()
                    .toUriString();
            JsonNode body = restClient.get().uri(url).retrieve().body(JsonNode.class);
            return parseReverse(body, latitude, longitude);
        } catch (RuntimeException exception) {
            log.warn("Geoapify reverse geocode failed ({}, {})", latitude, longitude, exception);
            return Optional.empty();
        }
    }

    private List<GeoSuggestionResponse> parseSuggestions(JsonNode body) {
        List<GeoSuggestionResponse> suggestions = new ArrayList<>();
        if (body == null) {
            return suggestions;
        }
        for (JsonNode feature : body.path("features")) {
            JsonNode properties = feature.path("properties");
            String name = firstNonBlank(text(properties, "name"), text(properties, "address_line1"));
            suggestions.add(new GeoSuggestionResponse(
                    name,
                    text(properties, "formatted"),
                    properties.path("lat").isNumber() ? properties.path("lat").asDouble() : null,
                    properties.path("lon").isNumber() ? properties.path("lon").asDouble() : null,
                    text(properties, "postcode"),
                    text(properties, "result_type"),
                    text(properties, "place_id")));
        }
        return suggestions;
    }

    private Optional<ReverseGeocodeResponse> parseReverse(JsonNode body, double latitude, double longitude) {
        JsonNode properties = body == null ? null : body.path("features").path(0).path("properties");
        if (properties == null || properties.isMissingNode() || properties.isNull()) {
            return Optional.empty();
        }
        return Optional.of(new ReverseGeocodeResponse(
                text(properties, "formatted"),
                text(properties, "street"),
                firstNonBlank(text(properties, "suburb"), text(properties, "neighbourhood"), text(properties, "quarter")),
                firstNonBlank(text(properties, "city"), text(properties, "town"), text(properties, "village")),
                firstNonBlank(text(properties, "district"), text(properties, "county")),
                text(properties, "state"),
                text(properties, "postcode"),
                latitude,
                longitude));
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
