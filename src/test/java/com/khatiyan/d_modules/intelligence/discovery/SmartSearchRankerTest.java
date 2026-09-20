package com.khatiyan.d_modules.intelligence.discovery;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.intelligence.discovery.DiscoveryIntentMapper.AttributePreferences;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.Landmark;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.Points;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchRanker.Ranked;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchRanker.Scored;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

/**
 * Which listings answer a sentence, which only nearly do, and in what order.
 *
 * <p>The distance scale is the user's (2026-09-12): within 3 km strong, 3 to
 * 5 km moderate, 5 to 15 km weak, and beyond 15 km not shown at all.
 */
class SmartSearchRankerTest {

    private static final double STATION_LAT = 22.5726;
    private static final double STATION_LNG = 88.3639;
    /** Degrees of latitude in one kilometre. */
    private static final double KM = 1 / 111.195;

    private final SmartSearchRanker ranker = new SmartSearchRanker();

    private static final Points STATION = new Points(
            "metro station", List.of(new Landmark("Kalighat Metro Station", STATION_LAT, STATION_LNG)));

    private static SearchArgs args() {
        return args(null, null, null);
    }

    private static SearchArgs args(String locality, PgFor pgFor, Boolean food) {
        return args(locality, pgFor, food, null);
    }

    private static SearchArgs args(String locality, PgFor pgFor, Boolean food, PropertyType type) {
        return new SearchArgs(
                "West Bengal", null, locality, null, null, null, pgFor, null, null, null, food,
                List.of(), null, null, List.of(), type);
    }

    private static AttributePreferences none() {
        return new AttributePreferences(null, List.of());
    }

    /** A Kolkata PG, {@code kmNorth} of the station, with food and wifi. */
    private static PropertyDiscoveryCardResponse listing(String name, Double kmNorth) {
        return listing(name, kmNorth, PropertyType.PG, 900_000, "Salt Lake", 2.0);
    }

    private static PropertyDiscoveryCardResponse listing(
            String name, Double kmNorth, PropertyType type, long depositPaise, String area, Double deviceKm) {
        BigDecimal lat = kmNorth == null ? null : BigDecimal.valueOf(STATION_LAT + kmNorth * KM);
        BigDecimal lng = kmNorth == null ? null : BigDecimal.valueOf(STATION_LNG);
        return new PropertyDiscoveryCardResponse(
                UUID.randomUUID(), name, null, null, "Street", area, "Kolkata", "West Bengal", "700091",
                lat, lng, deviceKm, null, type, PgFor.ANYONE, PreferredTenantType.ANYONE, true, Set.of(),
                true, BathroomType.COMMON, Set.of(SharingType.DOUBLE), Set.of(PropertyFacility.WIFI), Set.of(),
                depositPaise, null, false, null, null, null, List.of());
    }

    private static List<String> names(List<Scored> scored) {
        return scored.stream().map(entry -> entry.property().name()).toList();
    }

    @Nested
    @DisplayName("distance from a landmark")
    class Distance {

        @Test
        @DisplayName("within 3 km is strong, 3 to 5 moderate, 5 to 15 weak and related, beyond 15 not shown")
        void theScale() {
            Ranked ranked = ranker.rank(List.of(
                    listing("one", 1.0), listing("four", 4.0), listing("eight", 8.0), listing("twenty", 20.0)),
                    args(), none(), STATION, null);

            assertThat(names(ranked.matching())).containsExactly("one", "four");
            assertThat(ranked.matching()).extracting(Scored::strength)
                    .containsExactly(MatchStrength.STRONG, MatchStrength.MODERATE);
            assertThat(names(ranked.related())).containsExactly("eight");
            assertThat(ranked.related().get(0).strength()).isEqualTo(MatchStrength.WEAK);
        }

        @Test
        @DisplayName("a weak match says it is too far, never that its distance is unknown")
        void weakSaysTooFar() {
            Scored eight = ranker.rank(List.of(listing("eight", 8.0)), args(), none(), STATION, null)
                    .related().get(0);

            assertThat(eight.missedTags()).singleElement().asString()
                    .contains("8.0 km from Kalighat Metro Station")
                    .contains("further than 5 km");
        }

        @Test
        @DisplayName("a stated distance is the line between strong and weak")
        void statedDistance() {
            Ranked ranked = ranker.rank(List.of(listing("inside", 1.5), listing("outside", 3.0)),
                    args(), none(), STATION, 2.0);

            assertThat(names(ranked.matching())).containsExactly("inside");
            assertThat(ranked.related().get(0).missedTags()).singleElement().asString().contains("2 km as asked");
        }

        @Test
        @DisplayName("closest to the landmark comes first")
        void nearestFirst() {
            Ranked ranked = ranker.rank(List.of(listing("two", 2.0), listing("half", 0.5), listing("one", 1.0)),
                    args(), none(), STATION, null);

            assertThat(names(ranked.matching())).containsExactly("half", "one", "two");
        }

        @Test
        @DisplayName("a listing with no coordinates is kept, in related, as unknown")
        void unmeasurableIsKept() {
            Scored nowhere = ranker.rank(List.of(listing("nowhere", null)), args(), none(), STATION, null)
                    .related().get(0);

            assertThat(nowhere.missedTags()).singleElement().asString().contains("unknown");
        }

        @Test
        @DisplayName("a name that already says the kind is not repeated")
        void noStutter() {
            Scored one = ranker.rank(List.of(listing("one", 1.0)), args(), none(), STATION, null).matching().get(0);

            assertThat(one.matchedTags()).singleElement().asString().isEqualTo("1.0 km from Kalighat Metro Station");
        }
    }

    @Nested
    @DisplayName("without a landmark")
    class NoLandmark {

        @Test
        @DisplayName("more requirements met first, then nearest to the person, unknown distance last (2026-09-13)")
        void matchCountThenDistance() {
            Ranked ranked = ranker.rank(List.of(
                            listing("far", 1.0, PropertyType.PG, 900_000, "Salt Lake", 9.0),
                            listing("unknown", 1.0, PropertyType.PG, 900_000, "Salt Lake", null),
                            listing("near", 1.0, PropertyType.PG, 900_000, "Salt Lake", 1.5)),
                    args(), none(), null, null);

            assertThat(names(ranked.matching())).containsExactly("near", "far", "unknown");
        }

        @Test
        @DisplayName("no requirements means no meter at all")
        void noRequirementsNoStrength() {
            Scored only = ranker.rank(List.of(listing("only", 1.0)), args(), none(), null, null).matching().get(0);

            assertThat(only.strength()).isNull();
            assertThat(only.requirementCount()).isZero();
        }
    }

    @Nested
    @DisplayName("requirements")
    class Requirements {

        @Test
        @DisplayName("the area decides the section but is not counted in the meter")
        void areaIsNotARequirement() {
            Ranked ranked = ranker.rank(List.of(
                            listing("inside", 1.0, PropertyType.PG, 900_000, "Salt Lake", 1.0),
                            listing("outside", 1.0, PropertyType.PG, 900_000, "Howrah", 1.0)),
                    args("Salt Lake", null, true), none(), null, null);

            assertThat(names(ranked.matching())).containsExactly("inside");
            Scored outside = ranked.related().get(0);
            assertThat(outside.missedTags()).containsExactly("outside Salt Lake");
            assertThat(outside.requirementCount()).isEqualTo(1);
            assertThat(outside.strength()).isEqualTo(MatchStrength.STRONG);
        }

        @Test
        @DisplayName("a PG for anyone satisfies a search for girls")
        void anyoneSatisfiesAudience() {
            Ranked ranked = ranker.rank(List.of(listing("coed", 1.0)), args(null, PgFor.FEMALE, null), none(), null, null);

            assertThat(names(ranked.matching())).containsExactly("coed");
        }

        @Test
        @DisplayName("a hostel asked for puts PGs in related, saying what they are")
        void propertyTypeBuckets() {
            Ranked ranked = ranker.rank(List.of(
                            listing("hostel", 1.0, PropertyType.HOSTEL, 900_000, "Salt Lake", 1.0),
                            listing("pg", 1.0, PropertyType.PG, 900_000, "Salt Lake", 1.0)),
                    args(null, null, null, PropertyType.HOSTEL), none(), null, null);

            assertThat(names(ranked.matching())).containsExactly("hostel");
            assertThat(ranked.related().get(0).missedTags()).containsExactly("a PG, not a Hostel");
        }

        @Test
        @DisplayName("a deposit over the ceiling is a miss, one at it is a match")
        void depositCeiling() {
            Ranked ranked = ranker.rank(List.of(
                            listing("at", 1.0, PropertyType.PG, 1_000_000, "Salt Lake", 1.0),
                            listing("over", 1.0, PropertyType.PG, 1_500_000, "Salt Lake", 1.0)),
                    args(), new AttributePreferences(1_000_000L, List.of()), null, null);

            assertThat(names(ranked.matching())).containsExactly("at");
            assertThat(ranked.related().get(0).missedTags()).containsExactly("deposit above budget");
        }

        @Test
        @DisplayName("half the requirements met is moderate, less than half weak")
        void strengthByCount() {
            AttributePreferences twoFacilities = new AttributePreferences(
                    null, List.of(PropertyFacility.WIFI, PropertyFacility.GYM));

            Scored half = ranker.rank(List.of(listing("half", 1.0)), args(), twoFacilities, null, null)
                    .related().get(0);

            assertThat(half.strength()).isEqualTo(MatchStrength.MODERATE);
            assertThat(half.missedTags()).containsExactly("no GYM");
        }
    }

    @Test
    @DisplayName("every applied requirement gets a chip, in plain words")
    void chips() {
        SearchArgs args = new SearchArgs(
                "West Bengal", null, "Salt Lake", null, null, null, PgFor.FEMALE, null, 900_000L, null, true,
                List.of(), null, BathroomType.ATTACHED, List.of(), PropertyType.PG);
        AttributePreferences preferences = new AttributePreferences(
                1_000_000L, List.of(PropertyFacility.WIFI));

        assertThat(SmartSearchRanker.describe(args, preferences, "metro station")).containsExactly(
                "Salt Lake", "For female", "Under Rs 9,000", "Food included", "Attached bathroom", "PG",
                "Deposit under Rs 10,000", "Wifi", "Near metro station");
    }
}
