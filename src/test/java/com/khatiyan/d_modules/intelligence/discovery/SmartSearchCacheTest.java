package com.khatiyan.d_modules.intelligence.discovery;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What counts as the same search, so a repeat is not charged as a new one.
 */
class SmartSearchCacheTest {

    @Test
    @DisplayName("case, spacing and punctuation do not make a search new")
    void trivialDifferencesAreTheSameSearch() {
        String canonical = SmartSearchCache.sameSearch("PG near metro, Kolkata!");

        assertThat(SmartSearchCache.sameSearch("pg  near metro kolkata")).isEqualTo(canonical);
        assertThat(SmartSearchCache.sameSearch("  PG near metro  Kolkata ")).isEqualTo(canonical);
        assertThat(SmartSearchCache.sameSearch("PG-near-metro Kolkata...")).isEqualTo(canonical);
    }

    @Test
    @DisplayName("a changed word or number is a different search")
    void realChangesAreNew() {
        assertThat(SmartSearchCache.sameSearch("pg under 9000")).isNotEqualTo(SmartSearchCache.sameSearch("pg under 8000"));
        assertThat(SmartSearchCache.sameSearch("metro station")).isNotEqualTo(SmartSearchCache.sameSearch("metro stations"));
    }

    @Test
    @DisplayName("place names in other scripts survive")
    void otherScriptsSurvive() {
        assertThat(SmartSearchCache.sameSearch("সল্টলেক পিজি")).isEqualTo("সল্টলেক পিজি");
        assertThat(SmartSearchCache.sameSearch(null)).isEmpty();
    }
}
