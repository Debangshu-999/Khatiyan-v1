package com.khatiyan.d_modules.geo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.d_modules.geo.api.dto.NearbyPlaceResponse;
import com.khatiyan.d_modules.geo.service.providers.MapplsGeocodingProvider;

/**
 * A refused vendor call must not be remembered as a fact about the world.
 *
 * <p>Mappls cloud keys are whitelisted by IP. A dynamic home address rotating
 * answers 401 on every call — and because both "refused" and "nothing here"
 * used to arrive as an empty list, the refusal was written to a cache with a
 * thirty-day life. Whitelisting the new address then fixed nothing for a month,
 * with no log line left to explain why.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GeocodingServiceNearbyCacheTest {

    private static final double LAT = 17.4425673;
    private static final double LNG = 78.3353628;

    @Mock private MapplsGeocodingProvider mappls;
    @Mock private StringRedisTemplate valkeyTemplate;
    @Mock private ValueOperations<String, String> values;
    @Mock private RateLimitService rateLimitService;
    private GeocodingService service;

    @BeforeEach
    void setUp() {
        when(mappls.type()).thenReturn(GeocodingProviderType.MAPPLS);
        when(mappls.isConfigured()).thenReturn(true);
        when(valkeyTemplate.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn(null);

        service = new GeocodingService(
                List.of(mappls),
                valkeyTemplate,
                rateLimitService,
                new ObjectMapper(),
                "mappls",
                60,
                30,
                24,
                168,
                720,
                "mappls,geoapify");
    }

    @Test
    void aRefusedCallIsNotCached() {
        when(mappls.nearby(anyString(), anyDouble(), anyDouble(), anyInt()))
                .thenReturn(Optional.empty());

        List<NearbyPlaceResponse> places = service.nearby("HLTHSP", LAT, LNG, 5_000);

        assertThat(places).isEmpty();
        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    /**
     * An answered call that found nothing IS worth caching: a property with no
     * hospital within range will not grow one, and asking again every search
     * spends a vendor call to learn the same thing.
     */
    @Test
    void anAnsweredButEmptyResultIsStillCached() {
        when(mappls.nearby(anyString(), anyDouble(), anyDouble(), anyInt()))
                .thenReturn(Optional.of(List.of()));

        List<NearbyPlaceResponse> places = service.nearby("HLTHSP", LAT, LNG, 5_000);

        assertThat(places).isEmpty();
        verify(values).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void placesAreReturnedAndCachedWhenTheVendorAnswers() {
        when(mappls.nearby(anyString(), anyDouble(), anyDouble(), anyInt()))
                .thenReturn(Optional.of(List.of(
                        new NearbyPlaceResponse("Apollo Hospitals", "Gachibowli, Hyderabad", 365, "HWEAC2"))));

        List<NearbyPlaceResponse> places = service.nearby("HLTHSP", LAT, LNG, 5_000);

        assertThat(places).singleElement().satisfies(place -> {
            assertThat(place.name()).isEqualTo("Apollo Hospitals");
            // The map pins by this and nothing else — Mappls gives no
            // coordinates on a standard key.
            assertThat(place.eLoc()).isEqualTo("HWEAC2");
        });
        verify(values).set(anyString(), anyString(), any(Duration.class));
    }
}
