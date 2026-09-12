package com.khatiyan.d_modules.intelligence.discovery;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The kinds of place a search can be measured against.
 *
 * <p>These are not stored anywhere. Nobody files a listing under "near the
 * metro", and the owner-entered nearby-places list is far too sparse to search
 * on — four rows across two of thirty-nine published properties. So a sentence
 * that names a KIND of place is answered by asking the geocoder where those
 * places are, at search time, and measuring.
 *
 * <p><b>Every vendor category here was verified against live data</b> before
 * being shipped, because a category string the vendor does not recognise comes
 * back as an empty feature list rather than an error — indistinguishable from
 * a city with no metro. ({@code railway.station} was the one that looked
 * obvious and does not exist; {@code public_transport.train} is the real one,
 * and it at least answers 400 rather than lying.)
 *
 * <p>The keywords deliberately mirror the {@code keywords} column of
 * {@code discovery.local_place_subcategories}, which drives the same kind of
 * matching for a property's own nearby-places list. That table is the
 * owner-facing vocabulary and has no vendor categories in it, so the two are
 * kept aligned by hand rather than derived — if its synonyms change, change
 * these with them.
 *
 * <p><b>Gym is deliberately absent.</b> It is a property FACILITY, and "PG with
 * a gym" is the common ask by a wide margin. Treating it as a landmark too
 * would make the same word mean two different searches depending on a
 * preposition, and get it wrong most of the time.
 */
public enum LandmarkKind {

    METRO("public_transport.subway", "TRNMET", "metro station",
            "metro", "subway", "metro station"),

    RAILWAY("public_transport.train", "TRNRAL;TRNRAM;TRNLOC", "railway station",
            "railway", "train station", "railway station", "train"),

    BUS("public_transport.bus", "TRNBST", "bus stop",
            "bus stand", "bus stop", "bus terminus"),

    COLLEGE("education.college,education.university", "COMCLG;UNVSTT;CLGMDC", "college",
            "college", "university", "campus", "institute"),

    SCHOOL("education.school", "COMSCH;SCHNSS", "school",
            "school"),

    HOSPITAL("healthcare.hospital", "HLTHSP", "hospital",
            "hospital", "nursing home"),

    MARKET("commercial.supermarket,commercial.marketplace", "MKTMAN;MKTMJR;MKTSRT", "market",
            "market", "bazaar", "bazar", "supermarket", "grocery", "kirana"),

    /*
     * No Mappls codes. Its nearby search reaches 10 km and an airport is
     * usually further out than that — Kolkata's is about 13 km from the centre —
     * so every listing would read "no airport within 10 km". Geoapify's
     * city-wide category search measures it properly.
     */
    AIRPORT("airport", null, "airport",
            "airport");

    private final String vendorCategory;
    private final String mapplsCodes;
    private final String noun;
    private final List<String> keywords;

    LandmarkKind(String vendorCategory, String mapplsCodes, String noun, String... keywords) {
        this.vendorCategory = vendorCategory;
        this.mapplsCodes = mapplsCodes;
        this.noun = noun;
        this.keywords = List.of(keywords);
    }

    /**
     * Mappls category codes for this kind, several joined with ";", or null when
     * Mappls should not be used for it.
     *
     * <p>Learned from live responses, not guessed: each was the code Mappls put
     * on the places a plain search for the kind returned, checked from a real
     * listing to sort by distance correctly.
     */
    public String mapplsCodes() {
        return mapplsCodes;
    }

    /** The vendor's category identifier, or several separated by commas. */
    public String vendorCategory() {
        return vendorCategory;
    }

    /** How to name this kind in a sentence shown to somebody. */
    public String noun() {
        return noun;
    }

    /** The phrases that name this kind, for deciding whether a name is attached. */
    public List<String> keywords() {
        return keywords;
    }

    /**
     * The kind a phrase names, if any.
     *
     * <p>Longest keyword first, so "bus stand" is not claimed by a shorter
     * word inside it, and no kind is guessed from a phrase that names none —
     * an unrecognised landmark is reported as unusable, never approximated
     * into a different kind of place.
     */
    public static Optional<LandmarkKind> of(String phrase) {
        if (phrase == null || phrase.isBlank()) {
            return Optional.empty();
        }
        String text = phrase.toLowerCase(Locale.ROOT);
        return java.util.Arrays.stream(values())
                .flatMap(kind -> kind.keywords.stream().map(keyword -> new Match(kind, keyword)))
                .filter(match -> text.contains(match.keyword()))
                .max(java.util.Comparator.comparingInt(match -> match.keyword().length()))
                .map(Match::kind);
    }

    private record Match(LandmarkKind kind, String keyword) {
    }
}
