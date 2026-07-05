package com.khatiyan.d_modules.geo.service.providers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingProvider;
import com.khatiyan.d_modules.geo.service.GeocodingProviderType;

import lombok.extern.slf4j.Slf4j;

/**
 * Mappls (MapMyIndia) adapter. Autosuggest uses OAuth client credentials (the
 * bearer token is cached until shortly before expiry); reverse geocoding uses
 * the REST key in the URL path, per Mappls' API split. All URLs are
 * configurable so vendor changes never require a code change. Vendor failures
 * log a warning and return empty results — the picker degrades, the app does
 * not break.
 */
@Slf4j
@Component
public class MapplsGeocodingProvider implements GeocodingProvider {

    private static final Pattern PINCODE = Pattern.compile("\\b[1-9][0-9]{5}\\b");

    private final RestClient restClient;
    private final String tokenUrl;
    private final String autosuggestUrl;
    private final String reverseUrlTemplate;
    private final String clientId;
    private final String clientSecret;
    private final String restKey;

    private volatile String accessToken;
    private volatile Instant accessTokenExpiry = Instant.EPOCH;

    public MapplsGeocodingProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.geo.mappls.token-url:https://outpost.mappls.com/api/security/oauth/token}") String tokenUrl,
            @Value("${app.geo.mappls.autosuggest-url:https://atlas.mappls.com/api/places/search/json}") String autosuggestUrl,
            @Value("${app.geo.mappls.reverse-url:https://apis.mappls.com/advancedmaps/v1/%s/rev_geocode}") String reverseUrlTemplate,
            @Value("${app.geo.mappls.client-id:}") String clientId,
            @Value("${app.geo.mappls.client-secret:}") String clientSecret,
            @Value("${app.geo.mappls.rest-key:}") String restKey) {
        this.restClient = restClientBuilder.build();
        this.tokenUrl = tokenUrl;
        this.autosuggestUrl = autosuggestUrl;
        this.reverseUrlTemplate = reverseUrlTemplate;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.restKey = restKey;
    }

    @Override
    public GeocodingProviderType type() {
        return GeocodingProviderType.MAPPLS;
    }

    @Override
    public List<GeoSuggestionResponse> search(String query, Double nearLatitude, Double nearLongitude) {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            log.warn("Mappls search skipped: client credentials not configured (app.geo.mappls.client-id/secret)");
            return List.of();
        }
        try {
            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString(autosuggestUrl)
                    .queryParam("query", query);
            if (nearLatitude != null && nearLongitude != null) {
                uri.queryParam("location", nearLatitude + "," + nearLongitude);
            }
            JsonNode body = restClient.get()
                    .uri(uri.build().toUri())
                    .header("Authorization", "bearer " + token())
                    .retrieve()
                    .body(JsonNode.class);
            return parseSuggestions(body);
        } catch (RuntimeException exception) {
            log.warn("Mappls autosuggest failed query='{}'", query, exception);
            return List.of();
        }
    }

    @Override
    public Optional<ReverseGeocodeResponse> reverse(double latitude, double longitude) {
        if (restKey.isBlank()) {
            log.warn("Mappls reverse skipped: REST key not configured (app.geo.mappls.rest-key)");
            return Optional.empty();
        }
        try {
            String url = UriComponentsBuilder.fromUriString(String.format(reverseUrlTemplate, restKey))
                    .queryParam("lat", latitude)
                    .queryParam("lng", longitude)
                    .build()
                    .toUriString();
            JsonNode body = restClient.get().uri(url).retrieve().body(JsonNode.class);
            return parseReverse(body, latitude, longitude);
        } catch (RuntimeException exception) {
            log.warn("Mappls reverse geocode failed ({}, {})", latitude, longitude, exception);
            return Optional.empty();
        }
    }

    private List<GeoSuggestionResponse> parseSuggestions(JsonNode body) {
        List<GeoSuggestionResponse> suggestions = new ArrayList<>();
        if (body == null) {
            return suggestions;
        }
        for (JsonNode node : body.path("suggestedLocations")) {
            String address = node.path("placeAddress").asText(null);
            suggestions.add(new GeoSuggestionResponse(
                    node.path("placeName").asText(null),
                    address,
                    node.path("latitude").isNumber() ? node.path("latitude").asDouble() : null,
                    node.path("longitude").isNumber() ? node.path("longitude").asDouble() : null,
                    extractPincode(address),
                    node.path("type").asText(null),
                    node.path("eLoc").asText(null)));
        }
        return suggestions;
    }

    private Optional<ReverseGeocodeResponse> parseReverse(JsonNode body, double latitude, double longitude) {
        JsonNode result = body == null ? null : body.path("results").path(0);
        if (result == null || result.isMissingNode() || result.isNull()) {
            return Optional.empty();
        }
        return Optional.of(new ReverseGeocodeResponse(
                text(result, "formatted_address"),
                text(result, "street"),
                firstNonBlank(text(result, "subLocality"), text(result, "locality"), text(result, "village")),
                text(result, "city"),
                text(result, "district"),
                text(result, "state"),
                text(result, "pincode"),
                latitude,
                longitude));
    }

    // Bearer tokens last hours; refresh through a single flight a minute early.
    private synchronized String token() {
        if (accessToken != null && Instant.now().isBefore(accessTokenExpiry.minusSeconds(60))) {
            return accessToken;
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        JsonNode body = restClient.post()
                .uri(tokenUrl)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(JsonNode.class);
        if (body == null || body.path("access_token").isMissingNode()) {
            throw new IllegalStateException("Mappls token response missing access_token");
        }
        accessToken = body.path("access_token").asText();
        accessTokenExpiry = Instant.now().plusSeconds(body.path("expires_in").asLong(3600));
        return accessToken;
    }

    private static String extractPincode(String address) {
        if (address == null) {
            return null;
        }
        Matcher matcher = PINCODE.matcher(address);
        return matcher.find() ? matcher.group() : null;
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
