package com.khatiyan.d_modules.intelligence.discovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.LandmarkSet;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.Measured;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.Points;
import com.khatiyan.d_modules.geo.LandmarkKind;

/**
 * Deciding whether a phrase is a KIND of place or the NAME of one.
 *
 * <p>The costly mistake runs one way: a kind read as a name measures every
 * listing from one arbitrary place that happens to match the words. "Metro
 * station" once resolved to "Beleghata Metro Station Road", and "hospitals" to
 * "Lots Hospital".
 */
class LandmarkResolverTest {

    private static final BigDecimal KOLKATA_LAT = new BigDecimal("22.5726");
    private static final BigDecimal KOLKATA_LNG = new BigDecimal("88.3639");

    private GeoModule geo;
    private LandmarkResolver resolver;

    @BeforeEach
    void setUp() {
        geo = mock(GeoModule.class);
        when(geo.canMeasureNearby()).thenReturn(true);
        resolver = new LandmarkResolver(geo);
    }

    private static GeoSuggestionResponse place(String name, double lat, double lng) {
        return new GeoSuggestionResponse(name, name, lat, lng, null, null, null, null);
    }

    private LandmarkSet resolve(String phrase) {
        return resolver.resolve(phrase, KOLKATA_LAT, KOLKATA_LNG).orElseThrow();
    }

    @ParameterizedTest(name = "\"{0}\" is a kind")
    @DisplayName("a kind, in the singular, the plural, or with filler words, is measured per listing")
    @ValueSource(strings = {
            "metro station", "metro stations", "near metro", "hospital", "hospitals", "near hospitals",
            "a college", "colleges", "bus stops", "the nearest bus stand"})
    void kindsAreMeasured(String phrase) {
        assertThat(resolve(phrase)).isInstanceOf(Measured.class);
        verify(geo, never()).systemSearchNear(anyString(), anyDouble(), anyDouble());
    }

    @Test
    @DisplayName("a name that contains a kind word is looked up as one place (2026-09-13)")
    void namedHospitalIsOnePlace() {
        when(geo.systemSearchNear(eq("Lots Hospital"), anyDouble(), anyDouble()))
                .thenReturn(List.of(place("Lots Hospital", 22.53, 88.35)));

        LandmarkSet set = resolve("Lots Hospital");

        assertThat(set).isInstanceOf(Points.class);
        assertThat(set.label()).isEqualTo("Lots Hospital");
    }

    @Test
    @DisplayName("a wrong generic noun still finds the place by its distinctive part")
    void wrongNounFallsBackToTheName() {
        when(geo.systemSearchNear(eq("Sister Nivedita College"), anyDouble(), anyDouble())).thenReturn(List.of());
        when(geo.systemSearchNear(eq("sister nivedita"), anyDouble(), anyDouble()))
                .thenReturn(List.of(place("Sister Nivedita University", 22.62, 88.45)));

        LandmarkSet set = resolve("Sister Nivedita College");

        assertThat(set.label()).isEqualTo("Sister Nivedita University");
    }

    @Test
    @DisplayName("only the top match stands in for a named place")
    void namedPlaceUsesTheTopMatchOnly() {
        when(geo.systemSearchNear(eq("Victoria Memorial"), anyDouble(), anyDouble())).thenReturn(List.of(
                place("Victoria Memorial And Museum", 22.5448, 88.3426),
                place("Victoria Memorial Hall Gate", 22.5460, 88.3430)));

        Points set = (Points) resolve("Victoria Memorial");

        assertThat(set.landmarks()).hasSize(1);
    }

    @Test
    @DisplayName("without per-listing measuring, a kind comes from the city-wide search with junk removed")
    void cityWideKindDropsImplausiblePlaces() {
        when(geo.canMeasureNearby()).thenReturn(false);
        when(geo.places(eq("public_transport.subway"), anyDouble(), anyDouble(), anyInt(), anyInt())).thenReturn(List.of(
                place("Kalighat", 22.5186, 88.3456),
                place("Subway to CTC Bus Stand and Road Crossing", 22.5230, 88.3470)));

        Points set = (Points) resolve("metro station");

        assertThat(set.landmarks()).extracting(LandmarkResolver.Landmark::name).containsExactly("Kalighat");
    }

    @Test
    @DisplayName("a kind no per-listing vendor covers uses the city-wide search even when measuring is available")
    void airportIsCityWide() {
        when(geo.places(eq("airport"), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(List.of(place("Netaji Subhas Chandra Bose International Airport", 22.6547, 88.4467)));

        assertThat(resolve("airport")).isInstanceOf(Points.class);
    }

    @Test
    @DisplayName("nothing to measure from gives nothing, rather than a guess")
    void noCentreNoLandmark() {
        assertThat(resolver.resolve("metro station", null, KOLKATA_LNG)).isEmpty();
        assertThat(resolver.resolve("  ", KOLKATA_LAT, KOLKATA_LNG)).isEmpty();
    }

    @ParameterizedTest(name = "\"{0}\" is not a landmark")
    @DisplayName("entrances, crossings and platforms are not the place itself")
    @ValueSource(strings = {
            "Subway to CTC Bus Stand and Road Crossing", "Esplanade Metro Gate No 2",
            "Howrah Station Platform No 9", "Park Street Parking", "Sealdah Foot Over Bridge"})
    void implausibleNames(String name) {
        assertThat(LandmarkResolver.isPlausibleName(name)).isFalse();
    }

    @Test
    @DisplayName("real stations and hospitals are plausible")
    void plausibleNames() {
        assertThat(LandmarkResolver.isPlausibleName("Kalighat Metro Station")).isTrue();
        assertThat(LandmarkResolver.isPlausibleName("AMRI Hospital Salt Lake")).isTrue();
        assertThat(LandmarkResolver.isPlausibleName(null)).isFalse();
    }

    @Test
    @DisplayName("the nearest of several points is the one measured, by straight-line distance")
    void pointsMeasureTheNearest() {
        Points set = new Points("metro station", List.of(
                new LandmarkResolver.Landmark("Far", 22.70, 88.50),
                new LandmarkResolver.Landmark("Near", 22.5730, 88.3640)));

        LandmarkResolver.Nearest nearest = set.nearestTo(KOLKATA_LAT, KOLKATA_LNG).orElseThrow();

        assertThat(nearest.name()).isEqualTo("Near");
        assertThat(nearest.distanceKm()).isLessThan(0.1);
    }

    @Test
    @DisplayName("haversine agrees with a known distance")
    void haversine() {
        // 0.0391 degrees due north: one degree of latitude is 111.2 km.
        assertThat(LandmarkResolver.distanceKm(22.5448, 88.3426, 22.5839, 88.3426)).isCloseTo(4.35, within(0.05));
    }

    @Test
    @DisplayName("the longest keyword decides the kind")
    void longestKeywordWins() {
        assertThat(LandmarkKind.of("bus stand")).contains(LandmarkKind.BUS);
        assertThat(LandmarkKind.of("railway station")).contains(LandmarkKind.RAILWAY);
        assertThat(LandmarkKind.of("metro station")).contains(LandmarkKind.METRO);
        assertThat(LandmarkKind.of("Victoria Memorial")).isEmpty();
    }
}
