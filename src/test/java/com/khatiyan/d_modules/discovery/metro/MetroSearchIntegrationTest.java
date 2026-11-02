package com.khatiyan.d_modules.discovery.metro;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.data.Offset.offset;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.discovery.api.dto.DiscoverySort;
import com.khatiyan.d_modules.discovery.api.dto.MetroSystemResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.support.IntegrationTest;

@IntegrationTest
class MetroSearchIntegrationTest {

    private static final double ESPLANADE_LAT = 22.5638718;
    private static final double ESPLANADE_LNG = 88.3507426;
    private static final double PARK_STREET_LAT = 22.5551591;
    private static final double PARK_STREET_LNG = 88.3501171;
    private static final double KALIGHAT_LAT = 22.5168752;
    private static final double KALIGHAT_LNG = 88.3458448;

    private static UUID owner;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DiscoveryModule discovery;
    @Autowired private MetroService metro;

    private final List<UUID> mine = new ArrayList<>();

    @BeforeEach
    void anOwner() {
        if (owner == null) {
            owner = LargePropertySeeder.seed(jdbc, LocalDate.now(), 2, 1, 7310L).ownerId();
        }
    }

    @AfterEach
    void hideMine() {
        mine.forEach(id -> jdbc.update(
                "UPDATE discovery.property_discovery_profiles SET public_visible = false WHERE property_id = ?", id));
    }

    @Test
    void findsPropertiesNearAnyTickedStation() {
        UUID nearEsplanade = listed("Near Esplanade", ESPLANADE_LAT + 0.01, ESPLANADE_LNG);
        UUID nearKalighat = listed("Near Kalighat", KALIGHAT_LAT, KALIGHAT_LNG + 0.01);
        UUID farAway = listed("Far away", 22.9, 88.9);

        assertThat(search("kol-esplanade", "kol-kalighat")).extracting(PropertyDiscoveryCardResponse::propertyId)
                .contains(nearEsplanade, nearKalighat)
                .doesNotContain(farAway);
    }

    @Test
    void nearestTickedStationNamesTheCardAndOrdersIt() {
        UUID further = listed("Further", ESPLANADE_LAT + 0.02, ESPLANADE_LNG);
        UUID closer = listed("Closer", KALIGHAT_LAT + 0.001, KALIGHAT_LNG);

        List<PropertyDiscoveryCardResponse> found = search("kol-esplanade", "kol-kalighat");

        assertThat(found).extracting(PropertyDiscoveryCardResponse::propertyId).containsSubsequence(closer, further);
        assertThat(card(found, closer).nearestMetroStationName()).isEqualTo("Kalighat");
        assertThat(card(found, further).nearestMetroStationName()).isEqualTo("Esplanade");
    }

    @Test
    void aCloserUntickedStationIsNeverNamed() {
        UUID atParkStreet = listed("At Park Street", PARK_STREET_LAT, PARK_STREET_LNG);

        PropertyDiscoveryCardResponse found = card(search("kol-esplanade"), atParkStreet);

        assertThat(found.nearestMetroStationName()).isEqualTo("Esplanade");
        assertThat(found.distanceKm()).isCloseTo(0.97, offset(0.05));
    }

    @Test
    void otherFiltersStillApply() {
        UUID pg = listed("A PG", ESPLANADE_LAT, ESPLANADE_LNG);
        UUID hostel = listed("A hostel", ESPLANADE_LAT, ESPLANADE_LNG);
        jdbc.update("UPDATE property.properties SET type = 'HOSTEL' WHERE id = ?", hostel);

        List<PropertyDiscoveryCardResponse> found = discovery.searchVisibleProperties(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                PropertyType.HOSTEL, DiscoverySort.RELEVANCE, List.of("kol-esplanade"), 0, 200).items();

        assertThat(found).extracting(PropertyDiscoveryCardResponse::propertyId).contains(hostel).doesNotContain(pg);
    }

    @Test
    void aPlaceSearchIsIgnoredWhileStationsAreTicked() {
        UUID nearEsplanade = listed("Near Esplanade", ESPLANADE_LAT, ESPLANADE_LNG);

        List<PropertyDiscoveryCardResponse> found = discovery.searchVisibleProperties(
                "Goa", "Panaji", "US", "Calangute", BigDecimal.valueOf(15.5), BigDecimal.valueOf(73.8), 2.0,
                null, null, null, null, null, null, null, null, null,
                null, DiscoverySort.RELEVANCE, List.of("kol-esplanade"), 0, 200).items();

        assertThat(found).extracting(PropertyDiscoveryCardResponse::propertyId).contains(nearEsplanade);
    }

    @Test
    void aPropertyWithoutCoordinatesIsLeftOut() {
        UUID noCoordinates = listed("No coordinates", null, null);

        assertThat(search("kol-esplanade")).extracting(PropertyDiscoveryCardResponse::propertyId)
                .doesNotContain(noCoordinates);
    }

    @Test
    void aWholeLineAcrossTheCityReturnsOnlyTrueMatches() {
        List<String> blue = metro.systems().getFirst().lines().stream()
                .filter(line -> line.code().equals("kol-blue"))
                .flatMap(line -> line.stations().stream())
                .map(MetroSystemResponse.StationResponse::code)
                .toList();
        UUID onTheLine = listed("On the line", KALIGHAT_LAT, KALIGHAT_LNG);
        // Inside the box the ticked stations make, but over 5 km from every one of them.
        UUID insideTheBoxOnly = listed("Inside the box only", 22.54, 88.444);

        assertThat(search(blue.toArray(String[]::new))).extracting(PropertyDiscoveryCardResponse::propertyId)
                .contains(onTheLine)
                .doesNotContain(insideTheBoxOnly);
    }

    @Test
    void moreThanSixtyCodesIsRefused() {
        String[] tooMany = IntStream.range(0, 61).mapToObj(i -> "kol-code-" + i).toArray(String[]::new);

        assertThatThrownBy(() -> search(tooMany)).isInstanceOf(ValidationException.class);
    }

    @Test
    void anUnknownCodeFindsNothing() {
        listed("Near Esplanade", ESPLANADE_LAT, ESPLANADE_LNG);

        assertThat(search("kol-not-a-station")).isEmpty();
    }

    @Test
    void interchangeReportsTheOtherLineColour() {
        MetroSystemResponse kolkata = metro.systems().getFirst();

        assertThat(kolkata.code()).isEqualTo("kolkata");
        assertThat(station(kolkata, "kol-blue", "kol-esplanade").otherLineColours()).containsExactly(colour(kolkata, "kol-green"));
        assertThat(station(kolkata, "kol-green", "kol-esplanade").otherLineColours()).containsExactly(colour(kolkata, "kol-blue"));
        assertThat(station(kolkata, "kol-orange", "kol-kavi-subhash").otherLineColours()).containsExactly(colour(kolkata, "kol-blue"));
        assertThat(station(kolkata, "kol-blue", "kol-park-street").otherLineColours()).isEmpty();
    }

    @Test
    void aLineKnowsItsEnds() {
        MetroSystemResponse.LineResponse blue = metro.systems().getFirst().lines().stream()
                .filter(line -> line.code().equals("kol-blue")).findFirst().orElseThrow();

        assertThat(blue.fromStation()).isEqualTo("Dakshineswar");
        assertThat(blue.toStation()).isEqualTo("Kavi Subhash");
        assertThat(blue.stations()).hasSize(26);
    }

    private List<PropertyDiscoveryCardResponse> search(String... codes) {
        return discovery.searchVisibleProperties(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, DiscoverySort.RELEVANCE, List.of(codes), 0, 200).items();
    }

    private static PropertyDiscoveryCardResponse card(List<PropertyDiscoveryCardResponse> found, UUID id) {
        return found.stream().filter(card -> card.propertyId().equals(id)).findFirst().orElseThrow();
    }

    private static MetroSystemResponse.StationResponse station(MetroSystemResponse system, String line, String code) {
        return system.lines().stream().filter(l -> l.code().equals(line))
                .flatMap(l -> l.stations().stream())
                .filter(s -> s.code().equals(code)).findFirst().orElseThrow();
    }

    private static String colour(MetroSystemResponse system, String line) {
        return system.lines().stream().filter(l -> l.code().equals(line)).findFirst().orElseThrow().colour();
    }

    private UUID listed(String name, Double latitude, Double longitude) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property.properties (id, owner_id, name, address, city, pincode, type, created_at, updated_at,
                    reference_code, notice_period, is_active, latitude, longitude)
                VALUES (?, ?, ?, '1 Test Road', 'Kolkata', '700091', 'PG', now(), now(), ?, 'ONE_MONTH', true, ?, ?)
                """, id, owner, name, "MTR-" + id.toString().substring(0, 12), latitude, longitude);
        jdbc.update("""
                INSERT INTO discovery.property_discovery_profiles (id, property_id, headline, description, public_visible,
                    is_active, created_at, updated_at)
                VALUES (?, ?, ?, 'Test listing', true, true, now(), now())
                """, UUID.randomUUID(), id, name);
        mine.add(id);
        return id;
    }
}
