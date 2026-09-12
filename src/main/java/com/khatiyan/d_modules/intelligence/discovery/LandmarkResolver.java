package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;

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

    /**
     * What "near a metro station" means when nobody said how near.
     *
     * <p>A kilometre, because that is what people mean by walking distance to
     * one of many identical things. Stretching this would make the requirement
     * meaningless: a city has metro stations everywhere, so "within 15 km of a
     * station" is satisfied by every listing in it and the filter stops
     * filtering.
     */
    public static final double DEFAULT_NEAR_KIND_KM = 1.0;

    /**
     * What "near Sister Nivedita University" means when nobody said.
     *
     * <p>Far more generous, because a named place is ONE point and somebody
     * asking to be near it is describing which part of the city they want, not
     * a walk. Fifteen kilometres is the same side of a large Indian city, and
     * results are still ordered by distance, so the nearest are on top either
     * way. An empty screen is the failure to avoid here.
     */
    public static final double DEFAULT_NEAR_NAMED_KM = 15.0;

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
     * The places a search is measured against, and what to call them.
     *
     * <p>Either every place of a KIND — all the metro stations in a city — or
     * the single place somebody NAMED. The two behave identically from here on,
     * which is why they share one type: a set of points and a label.
     *
     * <p>An empty list is a real answer and not an error: the vendor may not
     * cover this kind of place, or the region may genuinely have none. Callers
     * must say so rather than return an unfiltered list as though the
     * requirement had been met.
     *
     * @param label         how to name this in a sentence — "metro station", or
     *                      the place's own name
     * @param defaultNearKm how near counts as near when the sentence did not say,
     *                      which differs for a kind and for a named place
     */
    public record LandmarkSet(String label, List<Landmark> landmarks, double defaultNearKm) {

        public boolean isEmpty() {
            return landmarks.isEmpty();
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
            return Optional.of(new LandmarkSet(
                    kind.get().noun(),
                    placed(geoModule.places(
                            kind.get().vendorCategory(), lat, lng, SEARCH_RADIUS_METERS, MAX_LANDMARKS)),
                    DEFAULT_NEAR_KIND_KM));
        }

        List<Landmark> named = byName(phrase.trim(), lat, lng);
        if (named.isEmpty()) {
            return Optional.of(new LandmarkSet(phrase.trim(), List.of(), DEFAULT_NEAR_NAMED_KM));
        }
        // The top match only. A named place is one place, and the runners-up
        // are other places with similar names — measuring against those would
        // quietly widen the search to somewhere nobody asked about.
        Landmark best = named.get(0);
        return Optional.of(new LandmarkSet(best.name(), List.of(best), DEFAULT_NEAR_NAMED_KM));
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
        String remainder = phrase.toLowerCase(java.util.Locale.ROOT);
        for (String keyword : kind.keywords()) {
            remainder = remainder.replace(keyword, " ");
        }
        for (String filler : FILLER_WORDS) {
            remainder = remainder.replace(filler, " ");
        }
        return remainder.isBlank();
    }

    private static String withoutGenericWords(String phrase) {
        String remainder = " " + phrase.toLowerCase(java.util.Locale.ROOT) + " ";
        for (String generic : GENERIC_PLACE_WORDS) {
            remainder = remainder.replace(" " + generic + " ", " ");
        }
        return remainder.trim();
    }

    /** Words that carry no name of their own. */
    private static final List<String> FILLER_WORDS =
            List.of(" a ", " an ", " the ", " any ", " some ", " near ", " nearby ", " close ", " to ", " of ", "s ");

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
