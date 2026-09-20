package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

/**
 * Turns what the model said into filters the search is allowed to run.
 *
 * <p><b>This is the airlock.</b> Everything on the far side of it is a typed
 * value the discovery search already understands. Nothing the model produced
 * reaches a query without passing through here, and anything that cannot be
 * mapped is reported rather than approximated. A search that quietly ignores
 * half a sentence looks like a search with poor stock.
 *
 * <p><b>It never repairs a contradiction.</b> A minimum above a maximum is
 * returned as a conflict with both values intact. Swapping them would be
 * deciding what the person meant, and being confidently wrong about someone's
 * budget is worse than telling them the two numbers disagree.
 *
 * <p><b>And it does not accept a filter the sentence did not ask for.</b> A
 * model handed a structured object fills it in: "PG in Kolkata" came back with
 * {@code foodIncluded=false}, {@code electricityIncluded=false} and
 * {@code bathroomType=COMMON}, none of which anybody typed. The prompt says not
 * to invent values and it does it anyway, because {@code false} looks to a
 * model like a reasonable answer to a question nobody asked. Those are dropped
 * here, and dropped SILENTLY — an unasked-for filter is not an unmet
 * requirement, so reporting it as one would confuse a reader as much as
 * applying it would.
 */
@Component
public class DiscoveryIntentMapper {

    /**
     * The rent a search will entertain, in rupees a month.
     *
     * <p>Not a validation of the market so much as of the model: "under 12k"
     * misread as 12 or as 1,200,000 both produce a plausible-looking number and
     * an empty or unfiltered result set. Outside this range the figure is
     * dropped and said to have been dropped.
     */
    private static final int MIN_SENSIBLE_RENT_RUPEES = 500;
    private static final int MAX_SENSIBLE_RENT_RUPEES = 200_000;

    /**
     * The furthest a stated distance may reach.
     *
     * <p>"Within 3 km" is a real constraint. "Within 500 km" is not a PG search,
     * and honouring it would return a state-wide list ordered by distance, which
     * is the shape of the bug region scope exists to prevent.
     */
    private static final int MAX_RADIUS_KM = 25;

    private static final int MIN_SENSIBLE_DEPOSIT_RUPEES = 500;
    private static final int MAX_SENSIBLE_DEPOSIT_RUPEES = 500_000;

    /**
     * Requirements that every property already answers, but no filter asks.
     *
     * <p>A property's deposit and its facilities are on every card and in
     * every row. They cannot go into {@link SearchArgs} because the discovery
     * search has no filter for them — but they can still rank results and
     * decide what belongs in the main list rather than the related one. Kept
     * apart from the filters for exactly that reason: these are scored, not
     * filtered, so a listing that misses one is demoted and explained rather
     * than hidden. (The property type used to live here too, until the filter
     * sheet gained a control for it.)
     *
     * @param maxDepositPaise the most deposit asked for, in paise
     */
    public record AttributePreferences(
            Long maxDepositPaise,
            List<PropertyFacility> facilities) {

        public boolean isEmpty() {
            return maxDepositPaise == null && facilities.isEmpty();
        }

        public int count() {
            return (maxDepositPaise == null ? 0 : 1) + facilities.size();
        }
    }

    /** What comes out of the airlock: filters, preferences, a landmark, and the rest. */
    public record MappedIntent(
            SearchArgs searchArgs,
            AttributePreferences preferences,
            /**
             * What to be near, as written — a kind of place or the name of one.
             *
             * <p>Left as text on purpose. Whether it resolves is a question for
             * the geocoder, not for this airlock: rejecting anything that was
             * not a known kind is what made "near Sister Nivedita University"
             * unanswerable when the place is perfectly findable.
             */
            String landmarkText,
            List<String> unresolvedRequirements,
            List<String> conflicts) {
    }

    /**
     * Words that show somebody actually mentioned a bathroom.
     *
     * <p>{@code COMMON} cannot be dropped on sight the way a {@code false}
     * can — "shared bathroom is fine" is a real thing to ask for — so this
     * looks for evidence in the sentence instead. Crude, and deliberately so:
     * the alternative is trusting a field the model fills either way.
     */
    private static final List<String> BATHROOM_WORDS =
            List.of("bathroom", "bath", "washroom", "toilet", "attached", "common", "shared");

    /**
     * Words that show somebody actually said who the stay is for.
     *
     * <p>The field this guards is the one with real consequences for being
     * wrong. Asked to read "pg in kolkata", the model answered
     * {@code pgFor=MALE} with a confidence of 1.0 — it treats "PG" itself as
     * meaning a men's PG. Nothing on screen would have explained why a woman
     * searching Kolkata was being shown men's accommodation, and the filter
     * would have looked like her own. So this one needs saying out loud before
     * it is applied.
     */
    private static final List<String> AUDIENCE_WORDS = List.of(
            "boy", "male", "men", "man", "gent", "bachelor",
            "girl", "female", "women", "woman", "ladies", "lady",
            "co-ed", "coed", "unisex", "anyone", "any gender", "mixed");

    /**
     * Words that show the KIND of place was asked for.
     *
     * <p>"PG" is in almost every search, and that is the point: somebody who
     * types "PG in Kolkata" does not want the one hostel mixed in among them.
     * The word is the requirement.
     */
    private static final List<String> TYPE_WORDS = List.of(
            "pg", "paying guest", "hostel", "apartment", "flat", "room");

    /**
     * Words that show a figure was about the rent.
     *
     * <p>Rent is the one hard filter a sentence can set, so it is the costliest
     * to invent. Asked to read a sentence naming only a deposit limit, the model
     * put the same 10,000 into the rent ceiling as well — and every listing with
     * rent on request fell out of the search, leaving nothing at all.
     */
    private static final List<String> RENT_WORDS = List.of(
            "rent", "budget", "month", "monthly", "/mo", " pm", "p.m", "price", "cost", "afford", "per bed");

    /** Words that show a student or working-professional stay was asked for. */
    private static final List<String> TENANT_TYPE_WORDS = List.of(
            "student", "college", "university", "school", "campus",
            "professional", "working", "employee", "office", "job");

    public MappedIntent map(DiscoveryIntentDraft draft, String query) {
        List<String> conflicts = new ArrayList<>();
        List<String> unresolved = new ArrayList<>(draft.unsupportedPhrasesOrEmpty());

        String sentence = query == null ? "" : query.toLowerCase(Locale.ROOT);

        // One amount, said about a deposit, and nothing said about rent: that
        // amount is the deposit, wherever the model put it. "Deposit under 10K"
        // came back as a rent ceiling with no deposit at all, and the hard rent
        // filter emptied the search.
        boolean onlyTheDeposit = sentence.contains("deposit")
                && !mentions(sentence, RENT_WORDS)
                && amountsIn(sentence) <= 1;
        Integer depositRupees = draft.maxDepositRupees() != null
                ? draft.maxDepositRupees()
                : onlyTheDeposit ? draft.maxRentRupees() : null;

        Long minRentPaise = rentToPaise(onlyTheDeposit ? null : draft.minRentRupees(), "minimum rent", unresolved);
        Long maxRentPaise = rentToPaise(onlyTheDeposit ? null : draft.maxRentRupees(), "maximum rent", unresolved);

        // Kept, both of them, and flagged. See the class note.
        if (minRentPaise != null && maxRentPaise != null && minRentPaise > maxRentPaise) {
            conflicts.add("The lowest rent asked for is higher than the highest.");
        }

        Integer radiusKm = radius(draft, unresolved);

        // A stated meal implies food, exactly as ticking a meal does on the
        // filter screen. Without this, "with dinner" would ask for dinner from
        // properties that do not claim to serve food at all.
        List<MealType> meals = draft.mealTypesOrEmpty();
        Boolean foodIncluded = !meals.isEmpty() ? Boolean.TRUE : onlyIfTrue(draft.foodIncluded());

        SearchArgs args = new SearchArgs(
                null, null, null, null, null,   // region scope and point are filled in after geocoding
                radiusKm,
                mentions(sentence, AUDIENCE_WORDS) ? stated(draft.pgFor()) : null,
                minRentPaise,
                maxRentPaise,
                mentions(sentence, TENANT_TYPE_WORDS) ? stated(draft.preferredFor()) : null,
                foodIncluded,
                meals,
                onlyIfTrue(draft.electricityIncluded()),
                mentions(sentence, BATHROOM_WORDS) ? draft.bathroomType() : null,
                draft.sharingTypesOrEmpty(),
                mentions(sentence, TYPE_WORDS) ? draft.propertyType() : null);

        AttributePreferences preferences = new AttributePreferences(
                deposit(depositRupees, sentence, unresolved),
                draft.facilitiesOrEmpty().stream()
                        .filter(facility -> FacilityWords.mentioned(facility, sentence))
                        .distinct()
                        .toList());

        String landmarkText = draft.landmarkText() == null || draft.landmarkText().isBlank()
                ? null
                : draft.landmarkText().trim();

        return new MappedIntent(
                args, preferences, landmarkText, List.copyOf(unresolved), List.copyOf(conflicts));
    }

    /** Places the resolved point and its region onto already-mapped filters. */
    public SearchArgs withLocation(
            SearchArgs args,
            String state,
            String city,
            String locality,
            BigDecimal latitude,
            BigDecimal longitude) {
        return new SearchArgs(
                state, city, locality, latitude, longitude,
                args.radiusKm(), args.pgFor(), args.minRentPaise(), args.maxRentPaise(),
                args.preferredFor(), args.foodIncluded(), args.mealTypes(),
                args.electricityIncluded(), args.bathroomType(), args.sharingTypes(), args.propertyType());
    }

    /**
     * Keeps a "yes" and throws away a "no".
     *
     * <p>Both of the booleans this guards — food, electricity — are things
     * people ask FOR. Nobody searches for a PG that excludes food, so a
     * {@code false} here is the model filling a slot rather than anybody's
     * requirement, and passing it on quietly reorders the results away from
     * exactly the places that offer what they asked about.
     */
    private static Boolean onlyIfTrue(Boolean value) {
        return Boolean.TRUE.equals(value) ? Boolean.TRUE : null;
    }

    /**
     * ANYONE is not a preference, it is the absence of one.
     *
     * <p>The filter sheet and the search both already read it that way, so
     * carrying it through only shows the person a filter set on a screen they
     * never touched.
     */
    private static PgFor stated(PgFor value) {
        return value == PgFor.ANYONE ? null : value;
    }

    private static PreferredTenantType stated(PreferredTenantType value) {
        return value == PreferredTenantType.ANYONE ? null : value;
    }

    /**
     * Whether the sentence itself supports a field the model filled in.
     *
     * <p>Substring, not whole word, so "boys" and "girls'" both land. It will
     * let the odd false positive through — "common area" reads as a bathroom
     * word — and that is the right way round: the cost of keeping a filter
     * somebody arguably implied is a visible chip they can remove, while the
     * cost of applying one they never mentioned is results they cannot
     * explain.
     */
    private static boolean mentions(String sentence, List<String> words) {
        return words.stream().anyMatch(sentence::contains);
    }

    /**
     * A deposit ceiling, if the sentence named one.
     *
     * <p>Range-checked like rent: a deposit is typically one to three months,
     * so a figure outside this is a misread magnitude rather than a budget,
     * and is reported as unused instead of silently ranking every listing
     * against nonsense.
     */
    private Long deposit(Integer rupees, String sentence, List<String> unresolved) {
        if (rupees == null || !sentence.contains("deposit")) {
            return null;
        }
        if (rupees <= 0) {
            return null;
        }
        if (rupees < MIN_SENSIBLE_DEPOSIT_RUPEES || rupees > MAX_SENSIBLE_DEPOSIT_RUPEES) {
            unresolved.add("The deposit figure did not look like a real amount, so it was not applied.");
            return null;
        }
        return rupees * 100L;
    }

    /**
     * A money-sized number: digits with optional commas, and an optional
     * k / thousand / lakh after it. Not followed by more letters, so "2 km" and
     * "3bhk" are not amounts.
     */
    private static final Pattern AMOUNT = Pattern.compile(
            "(?<![\\p{L}\\p{N}])(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|lakh|lac)?(?![\\p{L}\\p{N}])");

    /**
     * How many money figures the sentence states, each time one is written.
     *
     * <p>Counted per mention, not per distinct value: "under 10k, deposit under
     * 10k" names two limits that happen to match, and both apply. Anything
     * under 100 is a count or a distance ("2 km", "3 sharing"), not money.
     */
    static int amountsIn(String sentence) {
        Matcher matcher = AMOUNT.matcher(sentence);
        List<Long> amounts = new ArrayList<>();
        while (matcher.find()) {
            double value;
            try {
                value = Double.parseDouble(matcher.group(1).replace(",", ""));
            } catch (NumberFormatException notANumber) {
                continue;
            }
            String unit = matcher.group(2);
            if ("k".equals(unit) || "thousand".equals(unit)) {
                value *= 1_000;
            } else if ("lakh".equals(unit) || "lac".equals(unit)) {
                value *= 100_000;
            }
            if (value >= 100) {
                amounts.add(Math.round(value));
            }
        }
        return amounts.size();
    }

    /**
     * Rupees to paise, or nothing at all.
     *
     * <p>A figure outside the sensible range is dropped and named in the
     * unresolved list, so the reader is told their budget was not applied
     * rather than shown results that ignore it.
     */
    private Long rentToPaise(Integer rupees, String label, List<String> unresolved) {
        if (rupees == null) {
            return null;
        }
        // Zero is not a figure somebody typed, it is the model saying
        // "no bound" in a field that has to hold a number. Reporting it as
        // a rent that did not look monthly told readers their budget had
        // been dropped when they had only ever named one end of it.
        if (rupees <= 0) {
            return null;
        }
        if (rupees < MIN_SENSIBLE_RENT_RUPEES || rupees > MAX_SENSIBLE_RENT_RUPEES) {
            unresolved.add("The " + label + " did not look like a monthly figure, so it was not applied.");
            return null;
        }
        return rupees * 100L;
    }

    /**
     * A distance is only meaningful measured from somewhere.
     *
     * <p>With no anchor there is no point to measure from, so a radius is
     * dropped. There is deliberately no default: a place with no stated
     * distance searches its region, and inventing a radius on the person's
     * behalf shows up as stock that seems to be missing.
     */
    private Integer radius(DiscoveryIntentDraft draft, List<String> unresolved) {
        if (draft.radiusKm() == null) {
            return null;
        }
        if (draft.anchor() == null || draft.anchor() == SearchAnchor.NONE) {
            unresolved.add("A distance was mentioned without a place to measure it from.");
            return null;
        }
        if (draft.radiusKm() <= 0) {
            return null;
        }
        return Math.min(draft.radiusKm(), MAX_RADIUS_KM);
    }
}
