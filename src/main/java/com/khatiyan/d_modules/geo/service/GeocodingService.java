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

    public GeocodingService(
            List<GeocodingProvider> providers,
            StringRedisTemplate valkeyTemplate,
            RateLimitService rateLimitService,
            ObjectMapper objectMapper,
            @Value("${app.geo.provider:log}") String configuredProvider,
            @Value("${app.geo.search-rate-per-minute:60}") int searchRatePerMinute,
            @Value("${app.geo.reverse-rate-per-minute:30}") int reverseRatePerMinute,
            @Value("${app.geo.cache.search-ttl-hours:24}") long searchCacheTtlHours,
            @Value("${app.geo.cache.reverse-ttl-hours:168}") long reverseCacheTtlHours) {
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
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() < 2) {
            return List.of();
        }
        return cachedSearch(normalized, query.trim(), null, null);
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
