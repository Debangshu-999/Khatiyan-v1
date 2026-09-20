package com.khatiyan.d_modules.intelligence.discovery;

import java.util.List;

import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

/**
 * What the model is allowed to say it understood. Nothing more.
 *
 * <p>This record IS the contract: Spring AI generates the JSON schema from it,
 * Groq is held to that schema by constrained decoding, and a field that is not
 * here cannot come back. That is the safety property the whole feature rests
 * on — the sentence a person typed never reaches the search endpoint as text,
 * only these fields do, and each is validated before it becomes a filter.
 *
 * <p><b>The enums are the real ones</b>, imported from the property module
 * rather than re-declared. A new sharing type or meal type therefore changes
 * this schema automatically, and a removed one fails compilation here instead
 * of producing a filter value the search cannot honour.
 *
 * <p><b>No coordinates, ever.</b> The model returns {@link #locationText} as the
 * person wrote it. Resolving that to a point is the geocoder's job, server-side,
 * through the same path the typed search uses — so the same phrase cannot mean
 * two different places depending on who asked.
 *
 * <p><b>Rupees, not paise.</b> People speak in rupees and multiplying by a
 * hundred is Java's job. Asking a model for paise invites an order-of-magnitude
 * error that looks entirely plausible in the output.
 *
 * <p><b>Three kinds of field, and the difference matters.</b> Some map onto
 * filters the search already has (rent, food, sharing). Some map onto data
 * every property carries but no filter exposes — its type, its deposit, its
 * facilities — which can still rank results and decide what belongs in the
 * main list rather than the related one. And {@link #landmarkText} maps onto
 * nothing stored at all: it is resolved live against the geocoder, because
 * "near the metro" is not a column anybody fills in.
 *
 * @param locationText          the place as written, or null when no place was mentioned
 * @param landmarkText          a KIND of place to be near — "metro station", "college" —
 *                              as written. Resolved live, never stored, and reported as
 *                              unusable when it names a kind we cannot look up
 * @param anchor                what the search should be measured from
 * @param radiusKm              only meaningful with a PLACE or DEVICE anchor
 * @param unsupportedPhrases    phrases the model could not map, kept verbatim so the
 *                              reader is told what was ignored rather than left to
 *                              notice. Never translated into a nearby supported filter
 * @param confidence            0 to 1, the model's own estimate
 */
public record DiscoveryIntentDraft(
        String locationText,
        String landmarkText,
        SearchAnchor anchor,
        Integer radiusKm,
        PgFor pgFor,
        Integer minRentRupees,
        Integer maxRentRupees,
        PreferredTenantType preferredFor,
        Boolean foodIncluded,
        List<MealType> mealTypes,
        Boolean electricityIncluded,
        BathroomType bathroomType,
        List<SharingType> sharingTypes,
        PropertyType propertyType,
        Integer maxDepositRupees,
        List<PropertyFacility> facilities,
        List<String> unsupportedPhrases,
        Double confidence) {

    /**
     * The same draft, measured from somewhere else.
     *
     * <p>Used when a sentence names no place at all. "Girls PG near a metro
     * station" is a real search, but with no anchor there is no point to
     * measure the metro from — so the landmark resolves to nothing and the
     * person is told no metro station could be found, next to results that
     * plainly found some.
     */
    public DiscoveryIntentDraft withAnchor(SearchAnchor replacement) {
        return new DiscoveryIntentDraft(
                locationText,
                landmarkText,
                replacement,
                radiusKm,
                pgFor,
                minRentRupees,
                maxRentRupees,
                preferredFor,
                foodIncluded,
                mealTypes,
                electricityIncluded,
                bathroomType,
                sharingTypes,
                propertyType,
                maxDepositRupees,
                facilities,
                unsupportedPhrases,
                confidence);
    }

    /** Null-safe accessors, because a model may omit a list entirely. */
    public List<MealType> mealTypesOrEmpty() {
        return mealTypes == null ? List.of() : mealTypes;
    }

    public List<SharingType> sharingTypesOrEmpty() {
        return sharingTypes == null ? List.of() : sharingTypes;
    }

    public List<PropertyFacility> facilitiesOrEmpty() {
        return facilities == null ? List.of() : facilities;
    }

    public List<String> unsupportedPhrasesOrEmpty() {
        return unsupportedPhrases == null ? List.of() : unsupportedPhrases;
    }
}
