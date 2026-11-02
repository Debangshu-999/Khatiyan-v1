package com.khatiyan.d_modules.discovery.metro;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.discovery.metro.MetroProximity.Nearest;
import com.khatiyan.d_modules.discovery.metro.MetroProximity.PropertyPoint;
import com.khatiyan.d_modules.discovery.metro.MetroProximity.StationPoint;

class MetroProximityTest {

    /** One degree of latitude, in the kilometres the haversine uses. */
    private static final double KM_PER_DEGREE = 111.1949;

    private static final StationPoint ESPLANADE = new StationPoint("Esplanade", 22.5, 88.0);
    private static final StationPoint KALIGHAT = new StationPoint("Kalighat", 22.6, 88.0);

    @Test
    void keepsTheNearestOfSeveralStations() {
        UUID property = UUID.randomUUID();

        Map<UUID, Nearest> found = MetroProximity.nearest(
                List.of(new PropertyPoint(property, 22.59, 88.0)), List.of(ESPLANADE, KALIGHAT), 5.0);

        assertThat(found.get(property).stationName()).isEqualTo("Kalighat");
        assertThat(found.get(property).distanceKm()).isCloseTo(0.01 * KM_PER_DEGREE, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    void aPropertyJustPastTheRadiusIsOut() {
        UUID property = UUID.randomUUID();

        Map<UUID, Nearest> found = MetroProximity.nearest(
                List.of(new PropertyPoint(property, 22.5 + 5.01 / KM_PER_DEGREE, 88.0)), List.of(ESPLANADE), 5.0);

        assertThat(found).isEmpty();
    }

    @Test
    void aPropertyJustInsideIsIn() {
        UUID property = UUID.randomUUID();

        Map<UUID, Nearest> found = MetroProximity.nearest(
                List.of(new PropertyPoint(property, 22.5 + 4.99 / KM_PER_DEGREE, 88.0)), List.of(ESPLANADE), 5.0);

        assertThat(found).containsOnlyKeys(property);
    }
}
