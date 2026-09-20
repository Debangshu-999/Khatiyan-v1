package com.khatiyan.d_modules.verification.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Strict means strict.
 *
 * <p>The point of a verified tenancy is that the details on it are the details
 * on the tenant's government ID. Anything this waves through is a record whose
 * name is not the one on the document backing it, which is worth less than no
 * verification at all — it looks checked.
 */
class NameMatcherTest {

    // ---- the same name, typed differently -----------------------------------

    @Test
    void theSameNameMatches() {
        assertThat(NameMatcher.matches("Rajesh Kumar Sharma", "Rajesh Kumar Sharma")).isTrue();
    }

    @Test
    void caseDoesNotMatter() {
        assertThat(NameMatcher.matches("rajesh kumar sharma", "RAJESH KUMAR SHARMA")).isTrue();
    }

    @Test
    void extraSpacingDoesNotMatter() {
        assertThat(NameMatcher.matches("  Rajesh   Kumar  Sharma ", "RAJESH KUMAR SHARMA")).isTrue();
    }

    /** "R.K. Sharma" and "R K Sharma" are the same characters, differently punctuated. */
    @Test
    void punctuationDoesNotMatter() {
        assertThat(NameMatcher.matches("R.K. Sharma", "R K SHARMA")).isTrue();
    }

    // ---- a different name, however close ------------------------------------

    /**
     * The correction this class was rewritten for. Aadhaar carrying a surname
     * the tenancy never recorded does not mean the tenancy is verified — it
     * means we never wrote the tenant's full name down.
     */
    @Test
    void anExtraSurnameOnTheAadhaarIsARefusal() {
        assertThat(NameMatcher.matches("Rajesh Kumar", "RAJESH KUMAR SHARMA")).isFalse();
    }

    /** A middle name is part of a name, not an optional flourish. */
    @Test
    void aDroppedMiddleNameIsARefusal() {
        assertThat(NameMatcher.matches("Rajesh Kumar Sharma", "RAJESH SHARMA")).isFalse();
    }

    @Test
    void anInitialStandingInForANameIsARefusal() {
        assertThat(NameMatcher.matches("R Sharma", "RAJESH SHARMA")).isFalse();
    }

    @Test
    void anHonorificIsPartOfWhatWasTypedAndIsRefused() {
        assertThat(NameMatcher.matches("Mr Rajesh Kumar", "RAJESH KUMAR")).isFalse();
    }

    /** Same words, different document. */
    @Test
    void reorderedNamesAreRefused() {
        assertThat(NameMatcher.matches("Kumar Rajesh", "RAJESH KUMAR")).isFalse();
    }

    @Test
    void aDifferentPersonIsRefused() {
        assertThat(NameMatcher.matches("Rajesh Kumar", "SUNIL VERMA")).isFalse();
    }

    @Test
    void aSimilarlySpelledDifferentNameIsRefused() {
        assertThat(NameMatcher.matches("Rajesh Kumar", "RAMESH KUMAR")).isFalse();
    }

    @Test
    void anAbsentNameIsRefusedRatherThanThrowing() {
        assertThat(NameMatcher.matches(null, "RAJESH KUMAR")).isFalse();
        assertThat(NameMatcher.matches("  ", "RAJESH KUMAR")).isFalse();
        assertThat(NameMatcher.matches("Rajesh Kumar", null)).isFalse();
    }

    // ---- the score is for a human reading a failure -------------------------

    @Test
    void anExactMatchScoresOne() {
        assertThat(NameMatcher.score("Rajesh Kumar Sharma", "RAJESH KUMAR SHARMA"))
                .isEqualByComparingTo("1.000");
    }

    /**
     * Tells support which kind of failure this was: a missing middle name reads
     * very differently from a different human being.
     */
    @Test
    void aMissingMiddleNameScoresHighAndStillFails() {
        assertThat(NameMatcher.score("Rajesh Kumar Sharma", "RAJESH SHARMA"))
                .isEqualByComparingTo("0.667");
        assertThat(NameMatcher.matches("Rajesh Kumar Sharma", "RAJESH SHARMA")).isFalse();
    }

    @Test
    void anUnrelatedNameScoresZero() {
        assertThat(NameMatcher.score("Rajesh Kumar", "SUNIL VERMA")).isEqualByComparingTo("0.000");
    }

    @Test
    void anAbsentNameScoresZeroRatherThanThrowing() {
        assertThat(NameMatcher.score(null, "RAJESH KUMAR")).isEqualByComparingTo("0.000");
    }
}
