package com.khatiyan.d_modules.intelligence.discovery;

/**
 * How well one listing answers a sentence, as the card's meter shows it.
 *
 * <p>Decided here on the server rather than worked out on the card, because a
 * distance changes it in a way a count of requirements cannot: a PG 1.3 km from
 * a metro and one 4 km away both "meet" a near-the-metro requirement, and they
 * are not equally good answers. Keeping the rule in one place is what stops the
 * meter and the reason line under it from describing the same listing
 * differently.
 */
public enum MatchStrength {
    STRONG,
    MODERATE,
    WEAK;

    /** The weaker of two, so a good count cannot hide a long distance. */
    MatchStrength atMost(MatchStrength cap) {
        return cap == null || ordinal() >= cap.ordinal() ? this : cap;
    }
}
