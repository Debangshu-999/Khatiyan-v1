package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Everything one map screen needs, in one call.
 *
 * <p>The property is the map's anchor and the only pin placed from our own
 * coordinates with certainty, so it is returned whole rather than left for the
 * client to dig out of a tenancy.
 *
 * @param liveResults places found by the vendor for this query, pinned by
 *                    {@code eLoc} because a standard Mappls key returns no
 *                    coordinates. Empty until the vendor is reachable — see
 *                    {@code liveSearchAvailable}
 * @param liveSearchAvailable false when the vendor could not be asked at all.
 *                            The difference matters on screen: "nothing matched"
 *                            and "we could not look" are not the same sentence,
 *                            and a tenant told the first when the second is true
 *                            concludes the area is empty
 */
public record LocalPlacesMapResponse(
        PropertyAnchor property,
        List<PropertyLocalPlaceResponse> listedPlaces,
        List<LivePlace> liveResults,
        boolean liveSearchAvailable,
        /**
         * The chips offered under the search box.
         *
         * <p>Suggestions, not the limit. Anything can be searched — a kind of
         * place or the name of one — and these are simply the asks common
         * enough to be worth one tap.
         */
        List<SuggestedCategory> suggestedCategories
) {
    /** One chip: what it says, and what searching it actually sends. */
    public record SuggestedCategory(String label, String query) {
    }
    /** Where the map opens, and where every distance is measured from. */
    public record PropertyAnchor(
            String name,
            String addressText,
            BigDecimal latitude,
            BigDecimal longitude
    ) {
    }

    /**
     * A place the vendor knows about but we do not store.
     *
     * <p>No coordinates by design: {@code eLoc} is Mappls' own place code and
     * the native SDK drops a pin straight from one. Directions open
     * {@code https://mappls.com/<eLoc>}.
     */
    public record LivePlace(
            String name,
            String address,
            String eLoc,
            Integer distanceMeters,
            /**
             * Present only when the vendor gave a point.
             *
             * <p>Mappls does not on a standard key, which is what {@code eLoc}
             * is for — but the named-place lookup falls through to Geoapify,
             * which gives coordinates and no eLoc. A pin needs whichever
             * arrived, so both are optional and at least one is always set.
             */
            BigDecimal latitude,
            BigDecimal longitude
    ) {
    }
}
