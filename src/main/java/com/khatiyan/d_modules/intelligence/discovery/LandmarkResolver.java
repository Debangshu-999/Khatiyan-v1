package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.LandmarkKind;

/**
 * Finds the landmarks a search is measured against, and measures.
 *
 * <p>One vendor call answers a whole city: asking for every metro station
 * within 25 km of central Kolkata returns 62 of them, and they do not move, so
 * the geo module caches the answer for thirty days. Every search for a PG near
 * a metro in that city then costs nothing extra.
 *
 * <p>Distance is computed here rather than borrowed from the discovery module's
 * own helper, which is package-private to that module. Six lines of haversine
 * is a smaller price than a hole in a module boundary.
 */
@Service
public class LandmarkResolver {

    /**
     * How far around the region's centre to collect landmarks.
     *
     * <p>City-wide on purpose. The landmarks are not the answer, they are the
     * ruler — a listing on the far edge of the city still needs its nearest
     * station found, or it would be reported as far from everything simply
     * because nothing was looked for near it.
     */
    private static final int SEARCH_RADIUS_METERS = 25_000;

    private static final int MAX_LANDMARKS = 200;

    private static final double EARTH_RADIUS_KM = 6371.0088;

    private final GeoModule geoModule;

    public LandmarkResolver(GeoModule geoModule) {
        this.geoModule = geoModule;
    }

    /** One landmark, named and placed. */
    public record Landmark(String name, double latitude, double longitude) {
    }

    /** The nearest landmark to a listing, and how far. */
    public record Nearest(String name, double distanceKm) {
    }

    /**
     * What a search is measured against, and what to call it.
     *
     * <p>Two ways of measuring, one shape. {@link Points} holds the places
     * themselves and measures each listing to the nearest of them. {@link
     * Measured} holds no places at all and asks a vendor, per listing, what is
     * nearest and how far. The ranker never needs to know which it has.
     *
     * <p>How near counts as near is not decided here. One graded scale applies
     * to every landmark, kind or name alike — see {@link SmartSearchRanker}.
     */
    public sealed interface LandmarkSet permits Points, Measured {

        /** How to name this in a sentence — "metro station", or a place's own name. */
        String label();

        /** True when there is nothing to measure against at all. */
        boolean isEmpty();

        Optional<Nearest> nearestTo(BigDecimal latitude, BigDecimal longitude);

        /**
         * How far this set can see, or null when it covers the whole region.
         *
         * <p>A vendor that looks only so far cannot tell 12 km from 20 km, so
         * "nothing found" means "nothing within this reach", and the card has to
         * say so in those words.
         */
        Double reachKm();
    }

    /**
     * Every landmark of one kind in the region, or the one place somebody named,
     * placed and ready to measure against.
     *
     * <p>An empty list is a real answer and not an error: the vendor may not
     * cover this kind of place, or the region may genuinely have none. Callers
     * must say so rather than return an unfiltered list as though the
     * requirement had been met.
     */
    public record Points(String label, List<Landmark> landmarks) implements LandmarkSet {

        @Override
        public boolean isEmpty() {
            return landmarks.isEmpty();
        }

        @Override
        public Double reachKm() {
            return null;
        }

        public Optional<Nearest> nearestTo(BigDecimal latitude, BigDecimal longitude) {
            if (latitude == null || longitude == null || landmarks.isEmpty()) {
                return Optional.empty();
            }
            double lat = latitude.doubleValue();
            double lng = longitude.doubleValue();
            Landmark closest = null;
            double best = Double.MAX_VALUE;
            for (Landmark landmark : landmarks) {
                double distance = distanceKm(lat, lng, landmark.latitude(), landmark.longitude());
                if (distance < best) {
                    best = distance;
                    closest = landmark;
                }
            }
            return closest == null ? Optional.empty() : Optional.of(new Nearest(closest.name(), best));
        }
    }

    /**
     * A kind of place, measured per listing by Mappls.
     *
     * <p>Holds no places. For each listing it asks Mappls Nearby for the closest
     * place of the kind and how far it is — Mappls will not give coordinates on
     * a standard key, but it measures from any point it is handed, which is
     * exactly the number a card shows. Its station data is also better than
     * OpenStreetMap's: places carry a proper category code, so a pedestrian
     * underpass cannot come back as a metro station.
     *
     * <p>A call per listing, so {@link #warm} runs them side by side before
     * ranking, and every answer is cached for a month in the geo module —
     * neither listings nor stations move.
     */
    public static final class Measured implements LandmarkSet {

        private final String label;
        private final String categoryCodes;
        private final GeoModule geoModule;
        private final Map<String, Optional<Nearest>> measured = new ConcurrentHashMap<>();

        Measured(String label, String categoryCodes, GeoModule geoModule) {
            this.label = label;
            this.categoryCodes = categoryCodes;
            this.geoModule = geoModule;
        }

        @Override
        public String label() {
            return label;
        }

        @Override
        public boolean isEmpty() {
            return false;
        }

        @Override
        public Double reachKm() {
            return MEASURED_REACH_METERS / 1000.0;
        }

        @Override
        public Optional<Nearest> nearestTo(BigDecimal latitude, BigDecimal longitude) {
            if (latitude == null || longitude == null) {
                return Optional.empty();
            }
            return measured.computeIfAbsent(latitude.toPlainString() + "," + longitude.toPlainString(), key ->
                    geoModule.nearby(categoryCodes, latitude.doubleValue(), longitude.doubleValue(), MEASURED_REACH_METERS)
                            .stream()
                            // Mappls's categories are good, not perfect. The same
                            // backstop as the other path, taking the nearest
                            // place that is plausibly the place itself.
                            .filter(place -> isPlausibleName(place.name()))
                            .findFirst()
                            .map(place -> new Nearest(place.name(), place.distanceMeters() / 1000.0)));
        }

        /**
         * Measures many listings side by side.
         *
         * <p>Ranking asks one listing at a time, and twenty listings at 300 ms
         * each is six seconds in a row. Asked together, a few at a time so the
         * vendor is not flooded, the first search in a city costs well under a
         * second, and every later one is answered from cache.
         */
        void warm(List<BigDecimal[]> points) {
            Semaphore gate = new Semaphore(MAX_PARALLEL_MEASURES);
            try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
                for (BigDecimal[] point : points) {
                    pool.submit(() -> {
                        try {
                            gate.acquire();
                            try {
                                nearestTo(point[0], point[1]);
                            } finally {
                                gate.release();
                            }
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                        } catch (RuntimeException ignored) {
                            // Measured again, one at a time, when ranked.
                        }
                    });
                }
            }
        }

        /** Whether any listing had one of these within reach. */
        boolean foundAny() {
            return measured.values().stream().anyMatch(Optional::isPresent);
        }
    }

    /** Mappls Nearby looks no further than this. */
    static final int MEASURED_REACH_METERS = 10_000;

    private static final int MAX_PARALLEL_MEASURES = 8;

    /**
     * Resolves whatever somebody named into places to measure against.
     *
     * <p><b>Two paths, one result.</b> A phrase naming a KIND of place — metro,
     * college, hospital — becomes every such place in the region, from the
     * vendor's category index. Anything else is taken as the NAME of one
     * place — "Sister Nivedita University", "Howrah Bridge", "Acropolis Mall" —
     * and geocoded like any other address, biased to the region so a same-named
     * place in another state cannot win.
     *
     * <p>The named path is what makes this general. A fixed list of kinds could
     * only ever answer the handful of landmarks somebody thought to enumerate,
     * and "near Sister Nivedita University" is exactly the search a student
     * makes. Anything with a place name now works, whether or not we have a
     * category for it.
     *
     * @param phrase    what they called it — a kind, or a name
     * @param centreLat the region the search is scoped to
     * @return empty only when there is nowhere to measure from at all
     */
    public Optional<LandmarkSet> resolve(String phrase, BigDecimal centreLat, BigDecimal centreLng) {
        if (phrase == null || phrase.isBlank() || centreLat == null || centreLng == null) {
            return Optional.empty();
        }
        double lat = centreLat.doubleValue();
        double lng = centreLng.doubleValue();

        Optional<LandmarkKind> kind = LandmarkKind.of(phrase);
        if (kind.isPresent() && namesNothingElse(phrase, kind.get())) {
            // Mappls when it can measure this kind — better data, measured from
            // each listing. Geoapify's city-wide category search otherwise, and
            // always for the kinds Mappls's 10 km reach cannot serve.
            if (kind.get().mapplsCodes() != null && geoModule.canMeasureNearby()) {
                return Optional.of(new Measured(kind.get().noun(), kind.get().mapplsCodes(), geoModule));
            }
            return Optional.of(new Points(
                    kind.get().noun(),
                    placed(geoModule.places(
                                    kind.get().vendorCategory(), lat, lng, SEARCH_RADIUS_METERS, MAX_LANDMARKS))
                            .stream()
                            .filter(LandmarkResolver::isPlausibleLandmark)
                            .toList()));
        }

        List<Landmark> named = byName(phrase.trim(), lat, lng);
        if (named.isEmpty()) {
            return Optional.of(new Points(phrase.trim(), List.of()));
        }
        // The top match only. A named place is one place, and the runners-up
        // are other places with similar names — measuring against those would
        // quietly widen the search to somewhere nobody asked about.
        Landmark best = named.get(0);
        return Optional.of(new Points(best.name(), List.of(best)));
    }

    /**
     * Finds a named place, forgiving the name.
     *
     * <p>People get institution names wrong in ordinary ways — "Sister Nivedita
     * College" for a university, "Ruby Hospital" for a longer official name.
     * The geocoder's autocomplete already tolerates misspellings, but not a
     * substituted noun, so a second attempt drops the generic word and keeps
     * the distinctive part: "Sister Nivedita" finds the university whatever the
     * asker thought it was called.
     *
     * <p>Only two attempts, and the second is the same cached endpoint as the
     * first. Getting the name slightly wrong should not mean an empty screen.
     */
    private List<Landmark> byName(String phrase, double lat, double lng) {
        List<Landmark> exact = placed(geoModule.systemSearchNear(phrase, lat, lng));
        if (!exact.isEmpty()) {
            return exact;
        }
        String distinctive = withoutGenericWords(phrase);
        if (distinctive.isBlank() || distinctive.equalsIgnoreCase(phrase)) {
            return List.of();
        }
        return placed(geoModule.systemSearchNear(distinctive, lat, lng));
    }

    /*
     * The closest match is used even when it is a different KIND of place to
     * the one named — "Sister Nivedita University" resolving to "Sister Nivedita
     * Ladies' Hostel", because the university is not in the index at all.
     * Refusing those was tried and rejected (user, 2026-09-12): a search should
     * return what it can find rather than nothing. What keeps it honest is that
     * the resolved name is printed everywhere the anchor appears — the chip, the
     * card's distance line, the reason — so a reader can see exactly what the
     * distances were measured from.
     */


    /**
     * Whether the phrase is only the kind, with no name attached to it.
     *
     * <p>This is what separates "near a college" from "near Sister Nivedita
     * College". Both contain a kind keyword, and only the first one means every
     * college in the city — the second names ONE place, and treating it as the
     * kind threw the name away and measured against colleges nobody mentioned.
     */
    private static boolean namesNothingElse(String phrase, LandmarkKind kind) {
        String remainder = " " + phrase.toLowerCase(java.util.Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ") + " ";
        // Longest keyword first. Removing "metro" before "metro station" left
        // the word "station" behind, so "metro station" read as the NAME of a
        // place — and the geocoder obligingly matched "Beleghata Metro Station
        // Road", measuring every listing from a road instead of from the 62
        // actual stations.
        List<String> keywords = kind.keywords().stream()
                .sorted(java.util.Comparator.comparingInt(String::length).reversed())
                .toList();
        for (String keyword : keywords) {
            // Plural too. Removing only " hospital " left "hospitals" behind in
            // "near hospitals", which then read as the NAME of a place — and the
            // geocoder matched one particular hospital, measuring every listing
            // from it instead of from the nearest of all of them.
            remainder = remainder.replaceAll(" " + java.util.regex.Pattern.quote(keyword) + "(?:e?s)? ", " ");
        }
        // Whatever is left must be words that name nothing — including a
        // plural "s" or "stations" once the keyword itself is gone.
        return java.util.Arrays.stream(remainder.trim().split("\\s+"))
                .filter(token -> !token.isBlank())
                .allMatch(FILLER_WORDS::contains);
    }

    private static String withoutGenericWords(String phrase) {
        String remainder = " " + phrase.toLowerCase(java.util.Locale.ROOT) + " ";
        for (String generic : GENERIC_PLACE_WORDS) {
            remainder = remainder.replace(" " + generic + " ", " ");
        }
        return remainder.trim();
    }

    /** Words that carry no name of their own. */
    private static final java.util.Set<String> FILLER_WORDS = java.util.Set.of(
            "a", "an", "the", "any", "some", "near", "nearby", "nearest", "close", "closest",
            "to", "of", "by", "around", "s", "es", "station", "stations", "stop", "stops");

    /**
     * Generic nouns dropped on a second attempt at a name.
     *
     * <p>The ones people swap for each other. "College" and "university" are
     * the pair that matters most in this market.
     */
    private static final List<String> GENERIC_PLACE_WORDS = List.of(
            "college", "university", "institute", "school", "academy",
            "hospital", "nursing", "home", "clinic",
            "mall", "market", "bazaar", "complex",
            "station", "metro", "railway", "stadium", "park", "the");

    /**
     * Drops category results that are obviously not the place itself.
     *
     * <p>The map data is wrong in ways no field reveals. "Subway to CTC Bus
     * Stand and Road Crossing" — a pedestrian underpass — is tagged
     * {@code railway=station, station=subway, subway=yes}, exactly like
     * Kalighat or Central Park, so it came back as a metro station and a
     * listing was described as 1.7 km from it. Nothing structural separates
     * it, which leaves the name.
     *
     * <p>Deliberately phrases, not single words. "Road" alone would remove
     * Jessore Road and Mahatma Gandhi Road, which are real stations; "road
     * crossing" removes neither. Crude, and meant as a backstop until a
     * verified landmarks table exists for the cities that matter.
     */
    static boolean isPlausibleLandmark(Landmark landmark) {
        return isPlausibleName(landmark.name());
    }

    static boolean isPlausibleName(String placeName) {
        if (placeName == null || placeName.isBlank()) {
            return false;
        }
        String name = " " + placeName.toLowerCase(java.util.Locale.ROOT) + " ";
        return NOT_A_LANDMARK.stream().noneMatch(name::contains);
    }

    private static final List<String> NOT_A_LANDMARK = List.of(
            "subway to ", " crossing ", "road crossing", "underpass", "foot over bridge", " fob ",
            "skywalk", " entrance", " exit ", "exit gate", "gate no", " gate ",
            "parking", "ticket counter", "booking office", "platform no", " platform ");

    private static List<Landmark> placed(List<GeoSuggestionResponse> places) {
        return places.stream()
                .filter(place -> place.latitude() != null && place.longitude() != null)
                // An unnamed point cannot be shown as a reason, and "400 m from
                // somewhere" is not worth a line on a card.
                .filter(place -> place.name() != null && !place.name().isBlank())
                .map(place -> new Landmark(place.name(), place.latitude(), place.longitude()))
                .toList();
    }

    static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }
}
