package com.khatiyan.d_modules.geo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.util.List;

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
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.service.providers.MapplsGeocodingProvider;

/**
 * "LTIMindtree" in Hyderabad is several offices, and the map showed one.
 *
 * <p>Both callers of the named-place lookup shared one method, written for the
 * one that needed a single point: smart search measures "PGs within 2 km of
 * LTIMindtree" and cannot do that from four places at once, so the lookup took
 * the top hit and placed it by its pincode. The map inherited that and threw
 * away every office but the nearest.
 *
 * <p>They are two methods now. These assertions pin the difference, because it
 * is the kind that quietly collapses back into one.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LandmarkSearchAllTest {

    private static final double LAT = 17.4425673;
    private static final double LNG = 78.3353628;

    @Mock private MapplsGeocodingProvider mappls;
    @Mock private StringRedisTemplate valkeyTemplate;
    @Mock private ValueOperations<String, String> values;
    @Mock private RateLimitService rateLimitService;
    private GeocodingService service;

    /** As Mappls answers on a standard key: a place code, a distance, no coordinates. */
    private static GeoSuggestionResponse office(String name, String area, String eLoc, int metres) {
        return new GeoSuggestionResponse(
                name, area + ", Hyderabad, Telangana 500081", null, null, "500081",
                "POI", eLoc, metres);
    }

    @BeforeEach
    void setUp() {
        when(mappls.type()).thenReturn(GeocodingProviderType.MAPPLS);
        when(mappls.isConfigured()).thenReturn(true);
        when(valkeyTemplate.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn(null);
        when(mappls.search(anyString(), anyDouble(), anyDouble())).thenReturn(List.of(
                office("LTIMindtree", "Madhapur", "MM7LT1", 3_200),
                office("LTIMindtree", "Gachibowli", "MM7LT2", 5_800),
                office("LTIMindtree", "Pocharam", "MM7LT3", 24_100)));

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
    void aMapGetsEveryOffice() {
        List<GeoSuggestionResponse> places = service.landmarkSearchAll("LTIMindtree", LAT, LNG);

        assertThat(places).hasSize(3);
        assertThat(places).extracting(GeoSuggestionResponse::providerPlaceId)
                .containsExactly("MM7LT1", "MM7LT2", "MM7LT3");
    }

    /**
     * The place code is the whole point: it is the only handle these results
     * carry, and the map pins by it. Dropping hits that have no coordinate
     * would empty the list.
     */
    @Test
    void resultsWithNoCoordinatesAreKept() {
        List<GeoSuggestionResponse> places = service.landmarkSearchAll("LTIMindtree", LAT, LNG);

        assertThat(places).allSatisfy(place -> {
            assertThat(place.latitude()).isNull();
            assertThat(place.longitude()).isNull();
            assertThat(place.providerPlaceId()).isNotBlank();
        });
    }

    /** A hit with neither a coordinate nor a place code cannot be drawn anywhere. */
    @Test
    void aHitWithNothingToPinByIsDropped() {
        when(mappls.search(anyString(), anyDouble(), anyDouble())).thenReturn(List.of(
                office("LTIMindtree", "Madhapur", "MM7LT1", 3_200),
                office("LTIMindtree", "Nowhere", null, 9_000)));

        assertThat(service.landmarkSearchAll("LTIMindtree", LAT, LNG))
                .extracting(GeoSuggestionResponse::providerPlaceId)
                .containsExactly("MM7LT1");
    }

    /**
     * Smart search is unchanged, and must stay that way.
     *
     * <p>It still insists on a placed point, which here it cannot have —
     * placing a Mappls hit needs Geoapify to say where the pincode is, and no
     * Geoapify is configured in this test. Empty is the correct answer for
     * that caller and NOT the correct answer for the map, which is the whole
     * distinction.
     */
    @Test
    void theAnchorLookupStillReturnsAtMostOnePlacedPoint() {
        assertThat(service.landmarkSearch("LTIMindtree", LAT, LNG)).hasSizeLessThanOrEqualTo(1);
    }
}
