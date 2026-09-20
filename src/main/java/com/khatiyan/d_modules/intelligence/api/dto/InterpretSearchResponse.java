package com.khatiyan.d_modules.intelligence.api.dto;

import java.math.BigDecimal;
import java.util.List;

import com.khatiyan.d_modules.intelligence.discovery.InterpretStatus;
import com.khatiyan.d_modules.intelligence.discovery.SearchAnchor;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

/**
 * What the app understood, in a form the client can show and then run.
 *
 * <p>Two audiences in one payload, deliberately. {@link #searchArgs} is for the
 * machine: typed filters the existing discovery search already accepts, so the
 * sentence itself never reaches the search endpoint. Everything else is for the
 * person: the chips they can remove, the place we settled on, the phrases we
 * could not use and the conflicts we noticed.
 *
 * @param intentVersion           bumped when the schema or prompt changes, so a
 *                                cached interpretation from an older version is
 *                                never replayed against newer code
 * @param unresolvedRequirements  phrases we could not turn into a filter, kept
 *                                verbatim. Shown, never silently dropped and
 *                                never bent into a filter that means something
 *                                else — a search that quietly ignores "near the
 *                                metro" is worse than one that says it cannot
 * @param conflicts               things the sentence asked for that cannot both
 *                                hold, such as a minimum above the maximum.
 *                                Reported rather than repaired: swapping them
 *                                would be deciding what the person meant
 */
public record InterpretSearchResponse(
        String intentVersion,
        InterpretStatus status,
        SearchAnchor anchor,
        ResolvedLocation resolvedLocation,
        SearchArgs searchArgs,
        List<String> unresolvedRequirements,
        List<String> conflicts,
        Double confidence) {

    /** The single place the search is anchored to, once it is settled. */
    public record ResolvedLocation(
            String displayName,
            String locality,
            String city,
            String state,
            BigDecimal latitude,
            BigDecimal longitude) {
    }

    /**
     * Typed arguments for the existing discovery search.
     *
     * <p>Region scope — {@link #state}, {@link #city}, {@link #locality} — is
     * carried alongside the point and is mandatory whenever a place supplied
     * that point. Sending coordinates without it once returned all-India
     * results ranked by distance, putting a Hyderabad listing in a Kolkata
     * search.
     *
     * <p>Rent is in paise here, converted from the rupees the model returned.
     *
     * <p>{@link #propertyType} is the same PG-or-hostel filter the filter sheet
     * sets, so a sentence asking for a hostel shows up there as that filter.
     */
    public record SearchArgs(
            String state,
            String city,
            String locality,
            BigDecimal latitude,
            BigDecimal longitude,
            Integer radiusKm,
            PgFor pgFor,
            Long minRentPaise,
            Long maxRentPaise,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            List<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            List<SharingType> sharingTypes,
            PropertyType propertyType) {
    }
}
