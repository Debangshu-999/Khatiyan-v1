package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.discovery.api.dto.DiscoverySort;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

/**
 * Example sentences for the AI search box, written from listings that exist.
 *
 * <p><b>No model is called.</b> A suggestion is shown every time the box opens,
 * and spending a few thousand provider tokens to decorate an empty input would
 * use up the allowance that real searches run on. Nothing here counts against
 * anybody's smart searches either.
 *
 * <p><b>Every suggestion is built from one real listing</b>, using only facts
 * that listing has: its area, who it is for, whether food comes with it, and a
 * budget just above its rent. So tapping one always finds at least that listing.
 * A made-up "PG in Kolkata under 3000" that comes back empty would teach
 * somebody the feature does not work.
 *
 * <p><b>Where from.</b> The city is the one the listings nearest the device are
 * filed under, not the geocoder's name for where the device is. Salt Lake
 * reverse-geocodes to Bidhannagar, and a suggestion naming a city nobody files
 * listings under would find nothing.
 */
@Service
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class SmartSearchSuggestions {

    /** How many a box shows. */
    static final int MAX_SUGGESTIONS = 3;

    /** How far from the device a listing still counts as local. */
    private static final double LOCAL_RADIUS_KM = 50;

    /** How many of the nearest listings vote on which city this is. */
    private static final int CITY_VOTERS = 20;

    private static final int CANDIDATE_PAGE_SIZE = 200;

    /** Longer than this and an area name is an address line, not a place. */
    private static final int MAX_AREA_CHARS = 24;

    /**
     * Cities with a metro line, where "near metro station" is a fair example.
     *
     * <p>The one suggestion not read off a listing, so it is only offered where
     * a metro is certain. Anywhere else it would suggest something that is not
     * there.
     */
    private static final Set<String> METRO_CITIES = Set.of(
            "kolkata", "delhi", "new delhi", "noida", "gurugram", "gurgaon", "mumbai", "navi mumbai",
            "bengaluru", "bangalore", "hyderabad", "chennai", "pune", "ahmedabad", "lucknow",
            "jaipur", "kochi", "nagpur", "kanpur", "agra", "bhopal", "indore", "patna");

    private final DiscoveryModule discoveryModule;

    public SmartSearchSuggestions(DiscoveryModule discoveryModule) {
        this.discoveryModule = discoveryModule;
    }

    /**
     * Up to three sentences, different each call.
     *
     * <p>Empty when nothing is near enough to suggest from. The box then shows
     * no suggestions at all, which is better than examples from another city.
     * With no location at all, which a person can refuse, the examples come
     * from the city with the most listings instead.
     */
    public List<String> suggest(String state, BigDecimal latitude, BigDecimal longitude) {
        boolean hasPoint = latitude != null && longitude != null;
        List<PropertyDiscoveryCardResponse> nearby = candidates(state, latitude, longitude);
        // Nearest listings vote when there is a point. Without one every listing
        // votes, so the examples come from the city with the most stays.
        String city = homeCity(hasPoint ? nearby.stream().limit(CITY_VOTERS).toList() : nearby);
        if (city == null) {
            return List.of();
        }

        List<PropertyDiscoveryCardResponse> local = new ArrayList<>(nearby.stream()
                .filter(listing -> city.equalsIgnoreCase(trimmed(listing.city())))
                .filter(listing -> listing.type() == PropertyType.PG || listing.type() == PropertyType.HOSTEL)
                .toList());
        Collections.shuffle(local, ThreadLocalRandom.current());

        // Different listings can produce the same sentence. Normalised so "PG in
        // Salt Lake" and "pg in salt lake" are one suggestion, not two.
        Map<String, String> sentences = new LinkedHashMap<>();
        Set<String> placesUsed = new HashSet<>();
        // Two passes: first one per place, so three suggestions are not three
        // ways of asking about the same neighbourhood. Then anything left.
        for (boolean spreadPlaces : new boolean[] {true, false}) {
            for (PropertyDiscoveryCardResponse listing : local) {
                if (sentences.size() >= MAX_SUGGESTIONS) {
                    break;
                }
                Suggestion suggestion = from(listing, city);
                if (spreadPlaces && placesUsed.contains(suggestion.place().toLowerCase(Locale.ROOT))) {
                    continue;
                }
                if (sentences.putIfAbsent(suggestion.text().toLowerCase(Locale.ROOT), suggestion.text()) == null) {
                    placesUsed.add(suggestion.place().toLowerCase(Locale.ROOT));
                }
            }
        }

        if (sentences.size() < MAX_SUGGESTIONS && METRO_CITIES.contains(city.toLowerCase(Locale.ROOT))) {
            String metro = "PG near metro station in " + city;
            sentences.putIfAbsent(metro.toLowerCase(Locale.ROOT), metro);
        }
        return sentences.values().stream().limit(MAX_SUGGESTIONS).toList();
    }

    private List<PropertyDiscoveryCardResponse> candidates(String state, BigDecimal latitude, BigDecimal longitude) {
        boolean hasPoint = latitude != null && longitude != null;
        boolean hasState = state != null && !state.isBlank();
        return discoveryModule.searchVisibleProperties(
                        // With a point the radius does the scoping. The state is
                        // left out then, because a device near a state border is
                        // still local to listings on the other side of it.
                        hasPoint || !hasState ? null : state.trim(),
                        null,
                        null,
                        null,
                        latitude,
                        longitude,
                        hasPoint ? LOCAL_RADIUS_KM : null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        List.of(),
                        null,
                        null,
                        List.of(),
                        DiscoverySort.DISTANCE,
                        0,
                        CANDIDATE_PAGE_SIZE)
                .items();
    }

    /** The city most of these listings are filed under. */
    private static String homeCity(List<PropertyDiscoveryCardResponse> voters) {
        return voters.stream()
                .map(listing -> trimmed(listing.city()))
                .filter(city -> !city.isEmpty())
                .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
                .entrySet()
                .stream()
                // Ties go to the nearer city, which the insertion order already holds.
                .max(Comparator.comparingLong(Map.Entry::getValue))
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    private record Suggestion(String text, String place) {
    }

    /**
     * One sentence from one listing.
     *
     * <p>Short on purpose: a noun, a place and at most two details. A suggestion
     * is an example of what can be asked, and a long one reads as a form to
     * copy rather than an invitation to write your own.
     */
    private static Suggestion from(PropertyDiscoveryCardResponse listing, String city) {
        ThreadLocalRandom random = ThreadLocalRandom.current();

        String area = trimmed(listing.area());
        boolean usableArea = !area.isEmpty()
                && area.length() <= MAX_AREA_CHARS
                && !area.contains(",")
                && !area.equalsIgnoreCase(city);
        String place = usableArea && random.nextDouble() < 0.6 ? area : city;

        String noun = listing.type() == PropertyType.HOSTEL ? "Hostel" : "PG";

        List<String> details = new ArrayList<>();
        String audience = audience(listing.pgFor());
        if (audience != null && random.nextDouble() < 0.45) {
            noun = audience + " " + noun;
            details.add(audience);
        }

        List<String> extras = extras(listing);
        String extra = extras.isEmpty() || random.nextDouble() < 0.3
                ? null
                : extras.get(random.nextInt(extras.size()));

        String budget = budget(listing.startingRoomRentPaise());
        // At most two details, and at least one where the listing has any. "PG in
        // Kolkata" alone shows nothing the ordinary search could not.
        boolean withBudget = budget != null && (random.nextDouble() < 0.55 || (extra == null && details.isEmpty()));
        if (withBudget && extra != null && !details.isEmpty()) {
            extra = null;
        }

        StringBuilder text = new StringBuilder(noun);
        if (extra != null) {
            text.append(' ').append(extra);
        }
        text.append(" in ").append(place);
        if (withBudget) {
            text.append(" under ").append(budget);
        }
        return new Suggestion(text.toString(), place);
    }

    private static String audience(PgFor pgFor) {
        if (pgFor == PgFor.FEMALE) {
            return "Girls";
        }
        if (pgFor == PgFor.MALE) {
            return "Boys";
        }
        return null;
    }

    /** Details this listing really has, worded the way people ask for them. */
    private static List<String> extras(PropertyDiscoveryCardResponse listing) {
        List<String> extras = new ArrayList<>();
        if (listing.foodIncluded()) {
            extras.add("with food");
        }
        Set<PropertyFacility> facilities = listing.facilities() == null ? Set.of() : listing.facilities();
        if (facilities.contains(PropertyFacility.AIR_CONDITIONING)) {
            extras.add("with AC");
        }
        if (facilities.contains(PropertyFacility.WIFI)) {
            extras.add("with wifi");
        }
        if (listing.bathroomType() == BathroomType.ATTACHED) {
            extras.add("with attached bathroom");
        }
        if (listing.preferredFor() == PreferredTenantType.STUDENT) {
            extras.add("for students");
        } else if (listing.preferredFor() == PreferredTenantType.PROFESSIONAL) {
            extras.add("for working professionals");
        }
        return extras;
    }

    /**
     * A round budget above the listing's rent, so the listing is inside it.
     *
     * <p>Strictly above: a rent of exactly 9,000 gets "under ₹10,000", because
     * "under 9,000" read literally would leave it out.
     */
    private static String budget(Long startingRoomRentPaise) {
        if (startingRoomRentPaise == null || startingRoomRentPaise <= 0) {
            return null;
        }
        long rupees = startingRoomRentPaise / 100;
        long ceiling = (rupees / 1000 + 1) * 1000;
        return "₹" + String.format(Locale.ROOT, "%,d", ceiling);
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
