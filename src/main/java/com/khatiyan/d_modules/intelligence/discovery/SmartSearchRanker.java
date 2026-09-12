package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.intelligence.discovery.DiscoveryIntentMapper.AttributePreferences;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.LandmarkSet;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.Nearest;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PropertyFacility;

/**
 * Decides which listings answer a sentence, and which merely relate to it.
 *
 * <p><b>Nothing is hidden for missing a preference.</b> A listing that matches
 * part of what somebody said is shown under a related heading with the misses
 * named, because a blank screen over stock that nearly fits is the worst answer
 * this search can give. Only two things are absolute: the region, and the
 * budget — the app has always treated rent that way, and somebody who says
 * "under 9,000" does not want to browse 15,000.
 *
 * <p>Every requirement is counted the same way whether it came from a filter
 * the app exposes or from property data no filter asks about — type, deposit,
 * facilities. That is the whole point of the tier: a sentence can ask for a
 * hostel with a lift and get ranked results, without either ever becoming a
 * control on the filter sheet.
 */
@Service
public class SmartSearchRanker {

    /** One listing, with what it matched and why it is where it is. */
    public record Scored(
            PropertyDiscoveryCardResponse property,
            List<String> matchedTags,
            List<String> missedTags,
            int requirementCount,
            Nearest nearestLandmark,
            boolean answersEverything) {

        public int matchedCount() {
            return matchedTags.size();
        }
    }

    /** The two buckets, ordered. */
    public record Ranked(List<Scored> matching, List<Scored> related) {
    }

    public Ranked rank(
            List<PropertyDiscoveryCardResponse> candidates,
            SearchArgs args,
            AttributePreferences preferences,
            LandmarkSet landmarks,
            Double nearKm) {

        // The sentence wins when it states a distance. Otherwise the default
        // depends on what was named: a walk to one of many stations, or the
        // same side of the city as one particular place.
        double limit = nearKm != null
                ? nearKm
                : landmarks == null ? LandmarkResolver.DEFAULT_NEAR_KIND_KM : landmarks.defaultNearKm();
        List<Scored> scored = candidates.stream()
                .map(property -> score(property, args, preferences, landmarks, limit))
                .toList();

        // Closest first when a landmark was asked for, because that is the
        // thing that was asked for. Otherwise the listing that answers most of
        // the sentence leads.
        Comparator<Scored> order = landmarks != null && !landmarks.isEmpty()
                ? Comparator.comparingDouble(SmartSearchRanker::landmarkDistance)
                        .thenComparing(Comparator.comparingInt(Scored::matchedCount).reversed())
                : Comparator.comparingInt(Scored::matchedCount).reversed()
                        .thenComparing(entry -> entry.property().name());

        return new Ranked(
                scored.stream().filter(Scored::answersEverything).sorted(order).toList(),
                scored.stream().filter(entry -> !entry.answersEverything()).sorted(order).toList());
    }

    private static double landmarkDistance(Scored scored) {
        return scored.nearestLandmark() == null ? Double.MAX_VALUE : scored.nearestLandmark().distanceKm();
    }

    private Scored score(
            PropertyDiscoveryCardResponse property,
            SearchArgs args,
            AttributePreferences preferences,
            LandmarkSet landmarks,
            double nearKm) {

        List<String> matched = new ArrayList<>();
        List<String> missed = new ArrayList<>();
        int requirements = 0;

        // ---- the area somebody named ------------------------------------
        // Region is already guaranteed by the query. This is the finer
        // question of whether the listing is in the place they said, which is
        // what separates an answer from something nearby.
        //
        // Deliberately NOT counted as a requirement and not shown as a matched
        // tag: the area is WHERE the search ran, not a preference somebody set.
        // Counting it made "PG in Kolkata" report "2 of 2 filters" with a tag
        // reading "New Town" — a meter measuring the scope rather than the ask,
        // over a search with no filters in it at all.
        if (args.locality() != null && !args.locality().isBlank()
                && !inNamedArea(property, args.locality())) {
            missed.add("outside " + args.locality().trim());
        }

        // ---- filters the app already has --------------------------------
        if (args.pgFor() != null) {
            requirements++;
            boolean ok = property.pgFor() == args.pgFor() || property.pgFor().name().equals("ANYONE");
            record(ok, matched, missed, "for " + humanise(args.pgFor().name()), "not for " + humanise(args.pgFor().name()));
        }
        if (args.preferredFor() != null) {
            requirements++;
            boolean ok = property.preferredFor() == args.preferredFor()
                    || property.preferredFor().name().equals("ANYONE");
            record(ok, matched, missed, humanise(args.preferredFor().name()), "not for " + humanise(args.preferredFor().name()));
        }
        if (!args.mealTypes().isEmpty()) {
            requirements++;
            boolean ok = property.foodIncluded() && property.includedMeals().containsAll(args.mealTypes());
            record(ok, matched, missed, mealLabel(args.mealTypes()), "no " + mealLabel(args.mealTypes()));
        } else if (Boolean.TRUE.equals(args.foodIncluded())) {
            requirements++;
            record(property.foodIncluded(), matched, missed, "food included", "no food");
        }
        if (args.electricityIncluded() != null) {
            requirements++;
            boolean ok = property.electricityIncluded() == args.electricityIncluded();
            record(ok, matched, missed, "electricity included", "electricity extra");
        }
        if (args.bathroomType() != null) {
            requirements++;
            boolean ok = property.bathroomType() == args.bathroomType();
            String label = humanise(args.bathroomType().name()) + " bathroom";
            record(ok, matched, missed, label, "no " + label);
        }
        if (!args.sharingTypes().isEmpty()) {
            requirements++;
            boolean ok = args.sharingTypes().stream().anyMatch(property.availableSharingTypes()::contains);
            record(ok, matched, missed, "sharing available", "sharing not offered");
        }

        // ---- property data no filter asks about -------------------------
        if (preferences.propertyType() != null) {
            requirements++;
            boolean ok = property.type() == preferences.propertyType();
            String label = humanise(preferences.propertyType().name());
            record(ok, matched, missed, label, "a " + humanise(property.type().name()) + ", not a " + label);
        }
        if (preferences.maxDepositPaise() != null) {
            requirements++;
            boolean ok = property.standardDepositPaise() <= preferences.maxDepositPaise();
            record(ok, matched, missed, "deposit within budget", "deposit above budget");
        }
        for (PropertyFacility facility : preferences.facilities()) {
            requirements++;
            boolean ok = property.facilities().contains(facility);
            String label = humanise(facility.name());
            record(ok, matched, missed, label, "no " + label);
        }

        // ---- the landmark, resolved live --------------------------------
        Nearest nearest = null;
        if (landmarks != null && !landmarks.isEmpty()) {
            requirements++;
            nearest = landmarks.nearestTo(property.latitude(), property.longitude()).orElse(null);
            if (nearest != null && nearest.distanceKm() <= nearKm) {
                matched.add(distanceLabel(nearest) + " from " + describeNearest(nearest, landmarks));
            } else if (nearest != null) {
                missed.add(distanceLabel(nearest) + " from " + describeNearest(nearest, landmarks));
            } else {
                missed.add("nothing found near " + landmarks.label());
            }
        }

        return new Scored(
                property, List.copyOf(matched), List.copyOf(missed), requirements, nearest, missed.isEmpty());
    }

    private static void record(boolean ok, List<String> matched, List<String> missed, String hit, String miss) {
        if (ok) {
            matched.add(hit);
        } else {
            missed.add(miss);
        }
    }

    /**
     * Whether the listing sits in the area that was named.
     *
     * <p>Token-wise against the listing's own area, city and state, the same
     * shape the typed search uses — so "salt lake kolkata" is satisfied by an
     * area of "Salt Lake" in a city of "Kolkata" without either word having to
     * be the right kind of name.
     */
    private static boolean inNamedArea(PropertyDiscoveryCardResponse property, String locality) {
        String haystack = String.join(" ",
                        nullSafe(property.area()), nullSafe(property.city()), nullSafe(property.state()))
                .toLowerCase(Locale.ROOT);
        String[] tokens = locality.trim().toLowerCase(Locale.ROOT).split("[,\\s]+");
        for (String token : tokens) {
            if (!token.isBlank() && !haystack.contains(token)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Names the place measured against, without saying it twice.
     *
     * <p>A kind resolves to many places, so the name and the kind are both
     * worth saying — "Behala Bazar metro station". A named landmark resolves to
     * itself, where the label IS the name, and repeating it reads as a stutter.
     */
    private static String describeNearest(Nearest nearest, LandmarkSet landmarks) {
        return nearest.name().equalsIgnoreCase(landmarks.label())
                ? nearest.name()
                : nearest.name() + " " + landmarks.label();
    }

    private static String distanceLabel(Nearest nearest) {
        return nearest.distanceKm() < 1
                ? Math.round(nearest.distanceKm() * 1000) + " m"
                : String.format(Locale.ROOT, "%.1f km", nearest.distanceKm());
    }

    private static String mealLabel(List<MealType> meals) {
        return meals.stream().map(meal -> humanise(meal.name())).reduce((a, b) -> a + ", " + b).orElse("meals");
    }

    /**
     * An enum constant as somebody would read it.
     *
     * <p>Short constants stay upper case, because they are acronyms: PG, AC.
     * Sentence-casing them produced a tag reading "Pg", which looks like a
     * spelling mistake on a card.
     */
    private static String humanise(String token) {
        if (token.length() <= 3) {
            return token.toUpperCase(Locale.ROOT);
        }
        String spaced = token.toLowerCase(Locale.ROOT).replace('_', ' ');
        return spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Every requirement the search applied, in the same words the cards use.
     *
     * <p>These are the chips. They exist so nothing is applied that somebody
     * cannot see and undo — which matters most for the requirements that have
     * no control on the filter sheet at all, like a property type or a
     * facility. The wording lives here, beside the matching, so a chip and a
     * matched tag can never describe the same requirement differently.
     */
    public static List<String> describe(
            SearchArgs args, AttributePreferences preferences, String landmark) {
        List<String> chips = new ArrayList<>();
        if (args.locality() != null && !args.locality().isBlank()) {
            chips.add(args.locality().trim());
        }
        if (args.pgFor() != null) {
            chips.add("For " + humanise(args.pgFor().name()).toLowerCase(Locale.ROOT));
        }
        if (args.preferredFor() != null) {
            chips.add(humanise(args.preferredFor().name()));
        }
        if (args.maxRentPaise() != null) {
            chips.add("Under " + rupees(args.maxRentPaise()));
        }
        if (args.minRentPaise() != null) {
            chips.add("Over " + rupees(args.minRentPaise()));
        }
        if (!args.mealTypes().isEmpty()) {
            chips.add(mealLabel(args.mealTypes()));
        } else if (Boolean.TRUE.equals(args.foodIncluded())) {
            chips.add("Food included");
        }
        if (args.electricityIncluded() != null) {
            chips.add("Electricity included");
        }
        if (args.bathroomType() != null) {
            chips.add(humanise(args.bathroomType().name()) + " bathroom");
        }
        args.sharingTypes().forEach(sharing -> chips.add(humanise(sharing.name()) + " sharing"));
        if (preferences.propertyType() != null) {
            chips.add(humanise(preferences.propertyType().name()));
        }
        if (preferences.maxDepositPaise() != null) {
            chips.add("Deposit under " + rupees(preferences.maxDepositPaise()));
        }
        preferences.facilities().forEach(facility -> chips.add(humanise(facility.name())));
        if (landmark != null && !landmark.isBlank()) {
            chips.add("Near " + landmark.trim());
        }
        return List.copyOf(chips);
    }

    private static String rupees(long paise) {
        return "Rs " + String.format(Locale.ROOT, "%,d", paise / 100);
    }

    /** Exposed for the reason writer, which needs the same distance wording. */
    public static Optional<String> nearestLabel(Scored scored) {
        return scored.nearestLandmark() == null
                ? Optional.empty()
                : Optional.of(distanceLabel(scored.nearestLandmark()) + " from " + scored.nearestLandmark().name());
    }
}
