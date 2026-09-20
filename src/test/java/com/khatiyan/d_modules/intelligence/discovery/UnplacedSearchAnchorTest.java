package com.khatiyan.d_modules.intelligence.discovery;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import com.khatiyan.d_modules.geo.LandmarkKind;

/**
 * "Girls PG near metro stations", with no city in the sentence.
 *
 * <p>That search worked — it returned results — but printed two complaints over
 * them: <em>"A distance was mentioned without a place to measure it from"</em>
 * and <em>"Nothing called 'metro stations' could be found around there"</em>.
 *
 * <p>One cause behind both. With no place named the anchor was NONE, so the
 * search carried no coordinates, so {@code LandmarkResolver.resolve} returned
 * empty before it ever looked at the phrase, and a radius had nothing to be
 * measured from. Neither message was about anything the person got wrong.
 *
 * <p>The fix anchors such a search to the device. These assertions cover the
 * half that is reachable without a model: that an anchored draft stops the
 * radius complaint, and that swapping the anchor leaves every other field of a
 * draft alone.
 */
class UnplacedSearchAnchorTest {

    private final DiscoveryIntentMapper mapper = new DiscoveryIntentMapper();

    private static DiscoveryIntentDraft nearMetroWithin(Integer radiusKm, SearchAnchor anchor) {
        return new DiscoveryIntentDraft(
                null,
                "metro stations",
                anchor,
                radiusKm,
                null, null, null, null,
                null, null, null, null,
                List.of(), null, null, List.of(), List.of(), 0.9);
    }

    @Test
    void anUnplacedSearchCannotMeasureADistance() {
        DiscoveryIntentMapper.MappedIntent mapped =
                mapper.map(nearMetroWithin(2, SearchAnchor.NONE), "girls pg near metro stations within 2 km");

        assertThat(mapped.unresolvedRequirements())
                .anyMatch(message -> message.contains("without a place to measure it from"));
    }

    @Test
    void anchoringToTheDeviceMakesTheDistanceMeaningful() {
        DiscoveryIntentMapper.MappedIntent mapped =
                mapper.map(nearMetroWithin(2, SearchAnchor.DEVICE), "girls pg near metro stations within 2 km");

        assertThat(mapped.unresolvedRequirements())
                .noneMatch(message -> message.contains("without a place to measure it from"));
        assertThat(mapped.searchArgs().radiusKm()).isEqualTo(2);
    }

    /** The landmark has to survive the swap, or the search loses what it was for. */
    @Test
    void swappingTheAnchorChangesNothingElse() {
        DiscoveryIntentDraft unplaced = nearMetroWithin(2, SearchAnchor.NONE);
        DiscoveryIntentDraft anchored = unplaced.withAnchor(SearchAnchor.DEVICE);

        assertThat(anchored.anchor()).isEqualTo(SearchAnchor.DEVICE);
        assertThat(anchored.landmarkText()).isEqualTo("metro stations");
        assertThat(anchored.radiusKm()).isEqualTo(unplaced.radiusKm());
        assertThat(anchored.locationText()).isEqualTo(unplaced.locationText());
        assertThat(anchored.confidence()).isEqualTo(unplaced.confidence());
    }

    /**
     * The phrase itself was never the problem.
     *
     * <p>Worth stating, because the message blamed it: "metro stations" plural
     * resolves to the kind perfectly well, and did all along.
     */
    @Test
    void thePluralPhraseResolvesToTheKind() {
        assertThat(LandmarkKind.of("metro stations")).contains(LandmarkKind.METRO);
        assertThat(LandmarkKind.of("metro station")).contains(LandmarkKind.METRO);
    }
}
