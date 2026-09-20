package com.khatiyan.d_modules.geo.service.providers;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

// Jackson 3. Boot 4's RestClient message converters produce
// tools.jackson nodes, so reading a response into a Jackson 2 JsonNode
// throws at conversion — and this class catches RuntimeException and
// returns empty, so the failure looked like "no results" rather than
// like an error.
import tools.jackson.databind.JsonNode;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.NearbyPlaceResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingProvider;
import com.khatiyan.d_modules.geo.service.GeocodingProviderType;

import lombok.extern.slf4j.Slf4j;

/**
 * Mappls (MapmyIndia) adapter, used for smart search's landmarks.
 *
 * <p><b>Why Mappls for this.</b> Its index of Indian institutions and transit is
 * far better than OpenStreetMap's. Geoapify has no Sister Nivedita University
 * and files a pedestrian underpass as a metro station; Mappls finds the
 * university in New Town and categorises stations with a proper code
 * ({@code TRNMET}), so an underpass never comes back as one.
 *
 * <p><b>Authentication is a static key</b> on every request, as an
 * {@code access_token} query parameter. This replaced an OAuth client-credentials
 * flow against an older host; a cloud-type key, whitelisted by IP, is what
 * server-side calls need.
 *
 * <p><b>No coordinates.</b> On a standard key neither autosuggest nor nearby
 * returns latitude or longitude — those are a premium field of Place Details.
 * What they return instead is enough: autosuggest gives a place's real address
 * and pincode, and nearby gives a place's distance from any point we ask about.
 * {@link com.khatiyan.d_modules.geo.service.GeocodingService} builds on both.
 *
 * <p>Vendor failures log a warning and return empty — smart search then falls
 * back to Geoapify rather than failing.
 */
@Slf4j
@Component
public class MapplsGeocodingProvider implements GeocodingProvider {

    private static final Pattern PINCODE = Pattern.compile("\\b[1-9][0-9]{5}\\b");

    private final RestClient restClient;
    private final String autosuggestUrl;
    private final String nearbyUrl;
    private final String reverseUrlTemplate;
    private final String restKey;

    public MapplsGeocodingProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.geo.mappls.autosuggest-url:https://search.mappls.com/search/places/autosuggest/json}") String autosuggestUrl,
            @Value("${app.geo.mappls.nearby-url:https://search.mappls.com/search/places/nearby/json}") String nearbyUrl,
            @Value("${app.geo.mappls.reverse-url:https://apis.mappls.com/advancedmaps/v1/%s/rev_geocode}") String reverseUrlTemplate,
            @Value("${app.geo.mappls.rest-key:}") String restKey) {
        this.restClient = restClientBuilder.build();
        this.autosuggestUrl = autosuggestUrl;
        this.nearbyUrl = nearbyUrl;
        this.reverseUrlTemplate = reverseUrlTemplate;
        this.restKey = restKey;
    }

    @Override
    public GeocodingProviderType type() {
        return GeocodingProviderType.MAPPLS;
    }

    @Override
    public boolean isConfigured() {
        return !restKey.isBlank();
    }

    /**
     * Places matching a name, nearest to a point first.
     *
     * <p>Each result carries its address, pincode and straight-line distance
     * from the bias point — but no coordinates.
     */
    @Override
    public List<GeoSuggestionResponse> search(String query, Double nearLatitude, Double nearLongitude) {
        if (!isConfigured()) {
            return List.of();
        }
        try {
            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString(autosuggestUrl)
                    .queryParam("query", query)
                    .queryParam("region", "IND")
                    .queryParam("access_token", restKey);
            if (nearLatitude != null && nearLongitude != null) {
                uri.queryParam("location", nearLatitude + "," + nearLongitude);
            }
            JsonNode body = restClient.get().uri(uri.build().toUri()).retrieve().body(JsonNode.class);
            return parseSuggestions(body);
        } catch (RuntimeException exception) {
            // Not the query: it is a person's search and stays out of the log.
            log.warn("Mappls autosuggest failed", exception);
            return List.of();
        }
    }

    /**
     * The places of the given categories closest to a point, nearest first.
     *
     * <p>Category codes rather than free text. Free text from a busy centre came
     * back unsorted — "Apollo Hospitals, 6 m" from the middle of Kolkata — while
     * the codes sort properly from every point tried.
     *
     * @param categoryCodes Mappls codes, several joined with ";" for OR
     * @param radiusMeters  at most 10 000; the vendor does not look further
     */
    @Override
    public Optional<List<NearbyPlaceResponse>> nearby(
            String categoryCodes, double latitude, double longitude, int radiusMeters) {
        if (!isConfigured() || categoryCodes == null || categoryCodes.isBlank()) {
            return Optional.empty();
        }
        try {
            String url = UriComponentsBuilder.fromUriString(nearbyUrl)
                    .queryParam("keywords", categoryCodes)
                    .queryParam("refLocation", latitude + "," + longitude)
                    .queryParam("radius", Math.min(radiusMeters, 10_000))
                    .queryParam("sortBy", "dist:asc")
                    .queryParam("region", "IND")
                    .queryParam("access_token", restKey)
                    .build()
                    .toUriString();
            JsonNode body = restClient.get().uri(url).retrieve().body(JsonNode.class);
            List<NearbyPlaceResponse> places = new ArrayList<>();
            if (body == null) {
                return Optional.empty();
            }
            for (JsonNode node : body.path("suggestedLocations")) {
                String name = text(node, "placeName");
                if (name == null || !node.path("distance").isNumber()) {
                    continue;
                }
                places.add(new NearbyPlaceResponse(
                        name,
                        text(node, "placeAddress"),
                        node.path("distance").asInt(),
                        text(node, "eLoc")));
            }
            return Optional.of(places);
        } catch (RuntimeException exception) {
            // Refusals look like this too. A cloud key is whitelisted by IP, so
            // a moved office or a changed home address answers 401 on every
            // call — which must not be recorded as "there is no hospital here".
            log.warn("Mappls nearby failed categories={}", categoryCodes, exception);
            return Optional.empty();
        }
    }

    @Override
    public Optional<ReverseGeocodeResponse> reverse(double latitude, double longitude) {
        if (!isConfigured()) {
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
                    lastPincode(address),
                    node.path("type").asText(null),
                    node.path("eLoc").asText(null),
                    node.path("distance").isNumber() ? node.path("distance").asInt() : null));
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

    /**
     * The pincode at the END of an address.
     *
     * <p>The last six-digit number, not the first: an address such as
     * "DG 1/2, Rajarhat ..." can carry other digits earlier on, and the pincode
     * is always the tail.
     */
    private static String lastPincode(String address) {
        if (address == null) {
            return null;
        }
        Matcher matcher = PINCODE.matcher(address);
        String last = null;
        while (matcher.find()) {
            last = matcher.group();
        }
        return last;
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
