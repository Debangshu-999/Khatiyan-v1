package com.khatiyan.d_modules.discovery.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;

/**
 * "LTIMindtree", searched from a property in Gachibowli.
 *
 * <p>What came back: LTIMindtree Foundation on Mysore Road at 510.9 km, then
 * LTI Mindtree Corporate Office in Powai at 604.2 km, and only THEN Mindtree in
 * Kondapur at 3.8 km — a twenty-minute walk, listed third behind two cities.
 *
 * <p>Two faults in one list. Autosuggest is biased towards the point it is
 * given rather than bounded by it, so places in other states are eligible at
 * all; and it orders by its own idea of relevance, which is not distance.
 */
class NamedPlaceScopeTest {

    private static GeoSuggestionResponse at(String name, Integer metres) {
        return new GeoSuggestionResponse(
                name, name + " address", null, null, "500081", "POI", "E" + name.hashCode(), metres);
    }

    @Test
    void placesInOtherCitiesAreNotAroundHere() {
        List<GeoSuggestionResponse> scoped = PropertyLocalPlaceService.withinCityNearestFirst(List.of(
                at("LTIMindtree Foundation, Mysore Road", 510_900),
                at("LTI Mindtree Corporate Office, Powai", 604_200),
                at("Mindtree, Kondapur", 3_800)));

        assertThat(scoped).extracting(GeoSuggestionResponse::name)
                .containsExactly("Mindtree, Kondapur");
    }

    @Test
    void whatIsLeftIsNearestFirst() {
        List<GeoSuggestionResponse> scoped = PropertyLocalPlaceService.withinCityNearestFirst(List.of(
                at("Madhapur", 9_100),
                at("Pocharam", 24_400),
                at("Kondapur", 3_800)));

        assertThat(scoped).extracting(GeoSuggestionResponse::name)
                .containsExactly("Kondapur", "Madhapur", "Pocharam");
    }

    /**
     * Fifty kilometres is a metropolitan area, not a neighbourhood. An office
     * on the far edge of the city is still somewhere a tenant might go.
     */
    @Test
    void theFarSideOfTheCityIsStillTheCity() {
        assertThat(PropertyLocalPlaceService.withinCityNearestFirst(List.of(at("Outer ring", 48_000))))
                .hasSize(1);
        assertThat(PropertyLocalPlaceService.withinCityNearestFirst(List.of(at("Next state", 51_000))))
                .isEmpty();
    }

    /** Unmeasurable is not the same as far away — it goes last, not out. */
    @Test
    void aPlaceWithNoDistanceIsKeptAndSortedLast() {
        List<GeoSuggestionResponse> scoped = PropertyLocalPlaceService.withinCityNearestFirst(List.of(
                at("Unmeasured", null),
                at("Kondapur", 3_800)));

        assertThat(scoped).extracting(GeoSuggestionResponse::name)
                .containsExactly("Kondapur", "Unmeasured");
    }
}
