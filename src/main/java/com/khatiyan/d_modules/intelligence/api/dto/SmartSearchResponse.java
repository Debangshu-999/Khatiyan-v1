package com.khatiyan.d_modules.intelligence.api.dto;

import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.ResolvedLocation;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.intelligence.discovery.InterpretStatus;
import com.khatiyan.d_modules.intelligence.discovery.MatchStrength;

/**
 * A sentence, answered.
 *
 * <p>One call does the whole job — read the sentence, place the location, look
 * up any landmark, run the search, rank it, write the lines — because the
 * reasons cannot be written before the results exist and a client should not
 * have to orchestrate three round trips to ask one question.
 *
 * <p>{@link #searchArgs} is still returned, and still matters: it is what fills
 * the ordinary filter controls, so everything the sentence did is visible in
 * the same place a person would have set it by hand, and can be changed there.
 *
 * <p>The listings are the discovery module's own card shape, unchanged. A
 * client already knows how to draw one, and a parallel shape for AI results
 * would be two things to keep in step for no gain.
 *
 * @param requirements            every requirement that was applied, in plain words,
 *                                for the chips that let somebody see and undo them
 * @param unresolvedRequirements  what the sentence asked for that nothing here can
 *                                answer. Belongs beside the query, not beside a listing
 * @param matching                listings that answer the whole sentence
 * @param related                 listings that answer part of it, each carrying what it
 *                                missed. Shown rather than dropped: a blank screen over
 *                                stock that nearly fits is the worst possible answer
 */
public record SmartSearchResponse(
        String intentVersion,
        InterpretStatus status,
        ResolvedLocation resolvedLocation,
        /** The kind of place the search was measured against, named for a reader. */
        String landmark,
        SearchArgs searchArgs,
        List<String> requirements,
        List<String> unresolvedRequirements,
        List<String> conflicts,
        List<SmartSearchListing> matching,
        List<SmartSearchListing> related) {

    /**
     * One listing with its own account of itself.
     *
     * @param matchedTags   requirements this listing meets, already worded
     * @param missedTags    requirements it does not. Never empty for a related listing
     * @param nearestName   the closest landmark of the asked-for kind, if one was asked
     * @param reason        the AI's line for this card, or null when none was written.
     *                      Absent is normal: only the first page gets one, and a
     *                      provider failure leaves every card without one
     */
    public record SmartSearchListing(
            PropertyDiscoveryCardResponse property,
            List<String> matchedTags,
            List<String> missedTags,
            int requirementCount,
            String nearestName,
            Double nearestKm,
            /**
             * The card's meter, decided here. A distance moves it in a way a
             * count of requirements cannot, so the client does not recompute.
             */
            MatchStrength strength,
            String reason) {

        public UUID propertyId() {
            return property.propertyId();
        }
    }
}
