package com.khatiyan.d_modules.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * The kinds added 2026-09-20, and the words that must reach them.
 *
 * <p>Every Mappls code here was read off a real place — autosuggest for the
 * type, then the {@code keywords} Mappls put on the result, then a Nearby call
 * to confirm the code answers. Four of six first guesses were wrong, and a
 * wrong code is invisible: Mappls returns 204 No Content, which reads on screen
 * exactly like a neighbourhood with no pharmacy in it.
 *
 * <p>These assertions cannot catch a code going stale at the vendor. What they
 * do catch is somebody "tidying" a code back to the plausible-looking spelling.
 */
class LandmarkKindCodesTest {

    @Test
    void theVerifiedMapplsCodesAreTheOnesLiveCallsAnswered() {
        assertThat(LandmarkKind.PHARMACY.mapplsCodes()).isEqualTo("HLTMDS");
        assertThat(LandmarkKind.ATM.mapplsCodes()).isEqualTo("FINATM");
        assertThat(LandmarkKind.BANK.mapplsCodes()).isEqualTo("FINBNK");
        assertThat(LandmarkKind.POLICE.mapplsCodes()).isEqualTo("POLSTN;POLOFC");
        assertThat(LandmarkKind.PETROL_PUMP.mapplsCodes()).isEqualTo("TRNPMP");
        assertThat(LandmarkKind.RESTAURANT.mapplsCodes()).isEqualTo("FODOTH;FODPLZ");
    }

    @Test
    void theWordsPeopleActuallyTypeReachTheRightKind() {
        assertThat(LandmarkKind.of("chemist")).contains(LandmarkKind.PHARMACY);
        assertThat(LandmarkKind.of("medical store")).contains(LandmarkKind.PHARMACY);
        assertThat(LandmarkKind.of("atm")).contains(LandmarkKind.ATM);
        assertThat(LandmarkKind.of("bank")).contains(LandmarkKind.BANK);
        assertThat(LandmarkKind.of("thana")).contains(LandmarkKind.POLICE);
        assertThat(LandmarkKind.of("petrol pump")).contains(LandmarkKind.PETROL_PUMP);
        assertThat(LandmarkKind.of("dhaba")).contains(LandmarkKind.RESTAURANT);
    }

    /**
     * No word may reach two kinds.
     *
     * <p>{@code of()} returns one kind, so a word claimed twice resolves by
     * declaration order and the loser becomes unreachable — silently, and only
     * for the phrasings that happen to collide.
     */
    @Test
    void noKeywordIsClaimedByTwoKinds() {
        Map<String, LandmarkKind> owners = new HashMap<>();
        for (LandmarkKind kind : LandmarkKind.values()) {
            for (String keyword : kind.keywords()) {
                LandmarkKind existing = owners.put(keyword, kind);
                assertThat(existing)
                        .withFailMessage(
                                "Keyword '%s' is claimed by both %s and %s", keyword, existing, kind)
                        .isNull();
            }
        }
        assertThat(owners).isNotEmpty();
    }
}
