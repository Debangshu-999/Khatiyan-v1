package com.khatiyan.d_modules.geo.service;

import java.time.Duration;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.NearbyPlaceResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Server-side geocoding proxy: selects the configured provider, caches results
 * in Valkey (locality lookups repeat heavily, and the vendor quota is the
 * scarce resource), and rate-limits per user. Cache keys round coordinates —
 * the search bias to ~1km (ranking barely shifts inside that) and reverse
 * lookups to ~10m (one address either way) — to maximise hit rate.
 */
@Slf4j
@Service
public class GeocodingService {

    private static final String SEARCH_KEY_PREFIX = "khatiyan:geo:search:";
    private static final String PLACES_KEY_PREFIX = "khatiyan:geo:places:";
    private static final String LANDMARK_KEY_PREFIX = "khatiyan:geo:landmark:";
    private static final String NEARBY_KEY_PREFIX = "khatiyan:geo:nearby:";
    private static final String PINCODE_KEY_PREFIX = "khatiyan:geo:pincode:";

    private static final TypeReference<List<NearbyPlaceResponse>> NEARBY_LIST =
            new TypeReference<>() { };

    /**
     * How far a named place's pincode may sit from where Mappls says the place
     * is, before the placement is not trusted.
     *
     * <p>Two kilometres. The six Kolkata landmarks tested came in at 0.2 to
     * 1.4 km; a disagreement much larger than that means the pincode was
     * misread or the place is somewhere else, and measuring every listing from
     * it would be quietly wrong.
     */
    private static final double PINCODE_TOLERANCE_KM = 2.0;

    /** Neither stations nor listings move; a month is a safe age for a distance. */
    private static final Duration NEARBY_TTL = Duration.ofDays(30);
    private static final String REVERSE_KEY_PREFIX = "khatiyan:geo:reverse:";
    private static final TypeReference<List<GeoSuggestionResponse>> SUGGESTION_LIST =
            new TypeReference<>() {
            };

    private final Map<GeocodingProviderType, GeocodingProvider> providers;
    private final StringRedisTemplate valkeyTemplate;
    private final RateLimitService rateLimitService;
    private final ObjectMapper objectMapper;
    private final GeocodingProviderType activeProviderType;
    private final int searchRatePerMinute;
    private final int reverseRatePerMinute;
    private final Duration searchCacheTtl;
    private final Duration reverseCacheTtl;
    private final Duration placesCacheTtl;
    private final List<GeocodingProviderType> landmarkLookupOrder;

    public GeocodingService(
            List<GeocodingProvider> providers,
            StringRedisTemplate valkeyTemplate,
            RateLimitService rateLimitService,
            ObjectMapper objectMapper,
            @Value("${app.geo.provider:log}") String configuredProvider,
            @Value("${app.geo.search-rate-per-minute:60}") int searchRatePerMinute,
            @Value("${app.geo.reverse-rate-per-minute:30}") int reverseRatePerMinute,
            @Value("${app.geo.cache.search-ttl-hours:24}") long searchCacheTtlHours,
            @Value("${app.geo.cache.reverse-ttl-hours:168}") long reverseCacheTtlHours,
            // Thirty days. A metro station does not move, and this is the
            // difference between one vendor call a month per city and one per
            // search.
            @Value("${app.geo.cache.places-ttl-hours:720}") long placesCacheTtlHours,
            @Value("${app.geo.landmark-lookup:mappls,geoapify}") String landmarkLookup) {
        this.providers = new EnumMap<>(GeocodingProviderType.class);
        providers.forEach(provider -> this.providers.put(provider.type(), provider));
        this.valkeyTemplate = valkeyTemplate;
        this.rateLimitService = rateLimitService;
        this.objectMapper = objectMapper;
        this.activeProviderType = resolveProviderType(configuredProvider);
        this.searchRatePerMinute = searchRatePerMinute;
        this.reverseRatePerMinute = reverseRatePerMinute;
        this.searchCacheTtl = Duration.ofHours(searchCacheTtlHours);
        this.reverseCacheTtl = Duration.ofHours(reverseCacheTtlHours);
        this.placesCacheTtl = Duration.ofHours(placesCacheTtlHours);
        this.landmarkLookupOrder = java.util.Arrays.stream(landmarkLookup.split(","))
                .map(String::trim)
                .filter(name -> !name.isEmpty())
                .map(GeocodingService::resolveProviderType)
                .filter(type -> type != GeocodingProviderType.LOG)
                .distinct()
                .toList();
    }

    /**
     * Finds a NAMED place — a university, a hospital, a mall — for a search
     * that asked to be near it.
     *
     * <p><b>Not the active provider, a chain.</b> Ordinary autocomplete stays
     * on whichever provider the app is configured with. Named places go to
     * Mappls first, because it is built for Indian addresses and institutions
     * and OpenStreetMap's coverage of them is thin: Geoapify has no Sister
     * Nivedita University at all, and answers with a same-named ladies' hostel
     * in another part of the city. Geoapify stays behind it, both as the
     * fallback when Mappls finds nothing and as the only lookup until Mappls
     * credentials exist. A vendor with no credentials is skipped, not called.
     *
     * <p>A hit without coordinates is not a hit. Some autosuggest responses
     * carry only a place code, and a place that cannot be put on a map cannot
     * be measured from, so the chain moves on rather than returning it.
     */
    public List<GeoSuggestionResponse> landmarkSearch(String query, double latitude, double longitude) {
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() < 2) {
            return List.of();
        }
        for (GeocodingProviderType type : landmarkLookupOrder) {
            GeocodingProvider provider = providers.get(type);
            if (provider == null || !provider.isConfigured()) {
                continue;
            }
            String cacheKey = LANDMARK_KEY_PREFIX + type + ":" + normalized
                    + ":" + round(latitude, 2) + ":" + round(longitude, 2);
            String cached = valkeyTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                List<GeoSuggestionResponse> remembered = readSuggestions(cached);
                if (!remembered.isEmpty()) {
                    return remembered;
                }
                continue;
            }

            List<GeoSuggestionResponse> hits = provider.search(query.trim(), latitude, longitude);
            List<GeoSuggestionResponse> placed = type == GeocodingProviderType.MAPPLS
                    ? placeByPincode(hits, latitude, longitude)
                    : hits.stream().filter(hit -> hit.latitude() != null && hit.longitude() != null).toList();

            // Remembered either way. A name that finds nothing would otherwise
            // be looked up again on every search, at two vendors.
            writeCache(cacheKey, placed, searchCacheTtl);
            if (!placed.isEmpty()) {
                // The resolved name only — never the phrase that was typed,
                // which is a person's search and stays out of the log.
                log.info("Landmark resolved provider={} place='{}'", type, placed.get(0).name());
                return placed;
            }
        }
        return List.of();
    }

    /**
     * Gives Mappls results a position, which Mappls itself will not.
     *
     * <p>Mappls knows WHICH place is meant and where it is, but on a standard
     * key returns no coordinates. It does return the pincode and how far the
     * place is from the point we searched around. So the top result is placed
     * at its pincode's centre, and that position is checked against Mappls's
     * own distance: if the two disagree by more than
     * {@link #PINCODE_TOLERANCE_KM}, the placement is thrown away rather than
     * trusted, and the lookup falls through to the next provider.
     */
    private List<GeoSuggestionResponse> placeByPincode(
            List<GeoSuggestionResponse> hits, double biasLatitude, double biasLongitude) {
        GeocodingProvider geoapify = providers.get(GeocodingProviderType.GEOAPIFY);
        if (hits.isEmpty() || geoapify == null || !geoapify.isConfigured()) {
            return List.of();
        }
        GeoSuggestionResponse top = hits.get(0);
        if (top.pincode() == null) {
            return List.of();
        }
        Optional<double[]> centre = pincodeCentroid(geoapify, top.pincode());
        if (centre.isEmpty()) {
            return List.of();
        }
        double lat = centre.get()[0];
        double lng = centre.get()[1];
        if (top.distanceMeters() != null) {
            double placedKm = distanceKm(biasLatitude, biasLongitude, lat, lng);
            double mapplsKm = top.distanceMeters() / 1000.0;
            if (Math.abs(placedKm - mapplsKm) > PINCODE_TOLERANCE_KM) {
                log.warn("Landmark placement rejected place='{}' pincode={} placedKm={} mapplsKm={}",
                        top.name(), top.pincode(), round(placedKm, 1), round(mapplsKm, 1));
                return List.of();
            }
        }
        return List.of(new GeoSuggestionResponse(
                top.name(), top.address(), lat, lng, top.pincode(),
                top.placeType(), top.providerPlaceId(), top.distanceMeters()));
    }

    /** A pincode's centre, cached for a month — pincodes do not move. */
    private Optional<double[]> pincodeCentroid(GeocodingProvider geoapify, String pincode) {
        String cacheKey = PINCODE_KEY_PREFIX + pincode;
        String cached = valkeyTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            String[] parts = cached.split(",");
            if (parts.length == 2) {
                try {
                    return Optional.of(new double[] {Double.parseDouble(parts[0]), Double.parseDouble(parts[1])});
                } catch (NumberFormatException corrupt) {
                    log.warn("Corrupt pincode cache entry dropped pincode={}", pincode);
                }
            }
        }
        Optional<double[]> centre = geoapify.postcodeCentroid(pincode);
        centre.ifPresent(point -> {
            try {
                valkeyTemplate.opsForValue().set(cacheKey, point[0] + "," + point[1], NEARBY_TTL);
            } catch (RuntimeException exception) {
                log.warn("Geo cache write skipped key={}", cacheKey, exception);
            }
        });
        return centre;
    }

    /** Whether a vendor that measures distances per point is available. */
    public boolean canMeasureNearby() {
        GeocodingProvider mappls = providers.get(GeocodingProviderType.MAPPLS);
        return mappls != null && mappls.isConfigured();
    }

    /**
     * Places of the given categories nearest a point, with their distances.
     *
     * <p>Cached per category and point for a month, including "none within
     * range" — a listing that has no metro within 10 km will not grow one, and
     * asking again would spend a call to learn the same thing.
     */
    public List<NearbyPlaceResponse> nearby(String categoryCodes, double latitude, double longitude, int radiusMeters) {
        GeocodingProvider mappls = providers.get(GeocodingProviderType.MAPPLS);
        if (mappls == null || !mappls.isConfigured() || categoryCodes == null || categoryCodes.isBlank()) {
            return List.of();
        }
        String cacheKey = NEARBY_KEY_PREFIX + categoryCodes + ":" + radiusMeters
                + ":" + round(latitude, 4) + ":" + round(longitude, 4);
        String cached = valkeyTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            try {
                return objectMapper.readValue(cached, NEARBY_LIST);
            } catch (Exception exception) {
                log.warn("Corrupt geo nearby cache entry dropped", exception);
            }
        }
        List<NearbyPlaceResponse> places = mappls.nearby(categoryCodes, latitude, longitude, radiusMeters);
        writeCache(cacheKey, places, NEARBY_TTL);
        return places;
    }

    private static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * 6371.0088 * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /**
     * Every place of one kind around a point, cached hard.
     *
     * <p>No per-user rate limit, because the cache key is a coarse point and a
     * category rather than anything a person typed: everybody searching the
     * same city for the same kind of landmark shares one vendor call. The key
     * rounds the centre to two decimals — roughly a kilometre — so small
     * differences in where a search was anchored do not each buy their own
     * copy of the same station list.
     */
    public List<GeoSuggestionResponse> systemPlaces(
            String category, double latitude, double longitude, int radiusMeters, int limit) {
        if (category == null || category.isBlank()) {
            return List.of();
        }
        String cacheKey = PLACES_KEY_PREFIX + category
                + ":" + round(latitude, 2) + ":" + round(longitude, 2)
                + ":" + radiusMeters + ":" + limit;
        String cached = valkeyTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return readSuggestions(cached);
        }

        List<GeoSuggestionResponse> places =
                activeProvider().places(category, latitude, longitude, radiusMeters, limit);
        if (!places.isEmpty()) {
            writeCache(cacheKey, places, placesCacheTtl);
        }
        return places;
    }

    public List<GeoSuggestionResponse> search(UUID userId, String query, Double nearLatitude, Double nearLongitude) {
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() < 2) {
            return List.of();
        }
        rateLimitService.consumeOrThrow(
                "geo:search:" + userId,
                searchRatePerMinute,
                60,
                "Too many location searches. Please wait a moment.");
        return cachedSearch(normalized, query.trim(), nearLatitude, nearLongitude);
    }

    /**
     * Cache-backed search for internal jobs (coordinate backfill). No per-user
     * rate limit — callers bound their own batch size instead.
     */
    public List<GeoSuggestionResponse> systemSearch(String query) {
        return systemSearch(query, null, null);
    }

    /**
     * The same, biased towards a point so the nearest match ranks first.
     *
     * <p>Needed for a named landmark inside a region somebody already chose:
     * "Sister Nivedita University" unbiased can answer with a same-named
     * campus in another state, and measuring a Kolkata search against it puts
     * every listing hundreds of kilometres from the thing they asked to be
     * near.
     */
    public List<GeoSuggestionResponse> systemSearch(String query, Double nearLatitude, Double nearLongitude) {
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() < 2) {
            return List.of();
        }
        return cachedSearch(normalized, query.trim(), nearLatitude, nearLongitude);
    }

    /** False while the keyless LOG fallback is active — jobs skip vendor work then. */
    public boolean isLiveProvider() {
        return activeProviderType != GeocodingProviderType.LOG;
    }

    private List<GeoSuggestionResponse> cachedSearch(
            String normalized, String rawQuery, Double nearLatitude, Double nearLongitude) {
        String cacheKey = SEARCH_KEY_PREFIX + normalized + ":" + roundOrDash(nearLatitude, 2) + ":" + roundOrDash(nearLongitude, 2);
        String cached = valkeyTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return readSuggestions(cached);
        }

        List<GeoSuggestionResponse> suggestions = activeProvider().search(rawQuery, nearLatitude, nearLongitude);
        if (!suggestions.isEmpty()) {
            writeCache(cacheKey, suggestions, searchCacheTtl);
        }
        return suggestions;
    }

    public Optional<ReverseGeocodeResponse> reverse(UUID userId, double latitude, double longitude) {
        rateLimitService.consumeOrThrow(
                "geo:reverse:" + userId,
                reverseRatePerMinute,
                60,
                "Too many location lookups. Please wait a moment.");

        String cacheKey = REVERSE_KEY_PREFIX + round(latitude, 4) + ":" + round(longitude, 4);
        String cached = valkeyTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return readReverse(cached);
        }

        Optional<ReverseGeocodeResponse> result = activeProvider().reverse(latitude, longitude);
        result.ifPresent(value -> writeCache(cacheKey, value, reverseCacheTtl));
        return result;
    }

    private GeocodingProvider activeProvider() {
        GeocodingProvider provider = providers.get(activeProviderType);
        if (provider == null) {
            throw new IllegalStateException("No geocoding provider registered for type " + activeProviderType);
        }
        return provider;
    }

    private static GeocodingProviderType resolveProviderType(String configured) {
        try {
            return GeocodingProviderType.valueOf(configured.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException invalid) {
            return GeocodingProviderType.LOG;
        }
    }

    private List<GeoSuggestionResponse> readSuggestions(String json) {
        try {
            return objectMapper.readValue(json, SUGGESTION_LIST);
        } catch (Exception exception) {
            log.warn("Corrupt geo search cache entry dropped", exception);
            return List.of();
        }
    }

    private Optional<ReverseGeocodeResponse> readReverse(String json) {
        try {
            return Optional.of(objectMapper.readValue(json, ReverseGeocodeResponse.class));
        } catch (Exception exception) {
            log.warn("Corrupt geo reverse cache entry dropped", exception);
            return Optional.empty();
        }
    }

    private void writeCache(String key, Object value, Duration ttl) {
        try {
            valkeyTemplate.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception exception) {
            log.warn("Geo cache write skipped key={}", key, exception);
        }
    }

    private static String roundOrDash(Double value, int decimals) {
        return value == null ? "-" : round(value, decimals);
    }

    private static String round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return String.valueOf(Math.round(value * factor) / factor);
    }
}
