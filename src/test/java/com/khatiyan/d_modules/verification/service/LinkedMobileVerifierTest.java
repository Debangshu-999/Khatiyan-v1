package com.khatiyan.d_modules.verification.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The hash is only useful if we compute it the way UIDAI does.
 *
 * <p>There is no published test vector to pin this against, so these assert the
 * properties the specification states — the iteration count, its floor, and the
 * fact that changing any input changes the answer — rather than a magic string
 * that would only prove this file agrees with itself.
 */
class LinkedMobileVerifierTest {

    private static final String PHONE = "9800000002";
    private static final String SHARE_CODE = "Abc@123";

    @Test
    void aNumberMatchesItsOwnHash() {
        // Aadhaar ending 4, so four rounds, per UIDAI's example.
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches(PHONE, SHARE_CODE, "1234", hash)).isTrue();
    }

    @Test
    void aDifferentNumberDoesNotMatch() {
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches("9800000003", SHARE_CODE, "1234", hash)).isFalse();
    }

    /** The share code salts it, so the wrong one produces a different answer. */
    @Test
    void theWrongShareCodeDoesNotMatch() {
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches(PHONE, "Xyz@999", "1234", hash)).isFalse();
    }

    /** Get the round count wrong and the hash is simply a different number. */
    @Test
    void theWrongIterationCountDoesNotMatch() {
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches(PHONE, SHARE_CODE, "1235", hash)).isFalse();
    }

    @Test
    void theRoundCountIsTheLastDigitOfTheAadhaar() {
        assertThat(LinkedMobileVerifier.iterationsFor("1234")).isEqualTo(4);
        assertThat(LinkedMobileVerifier.iterationsFor("9999")).isEqualTo(9);
    }

    /** An Aadhaar ending 0 or 1 is hashed once, not zero times. */
    @Test
    void theRoundCountNeverFallsBelowOne() {
        assertThat(LinkedMobileVerifier.iterationsFor("1230")).isEqualTo(1);
        assertThat(LinkedMobileVerifier.iterationsFor("1231")).isEqualTo(1);
        assertThat(LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 1))
                .isEqualTo(LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 1));
    }

    /**
     * Missing inputs are "not confirmed", never an exception. A provider that
     * returns no hash, or a flow that used no share code, must not take a
     * verification down with it.
     */
    @Test
    void anythingMissingIsSimplyNotConfirmed() {
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches(null, SHARE_CODE, "1234", hash)).isFalse();
        assertThat(LinkedMobileVerifier.matches(PHONE, null, "1234", hash)).isFalse();
        assertThat(LinkedMobileVerifier.matches(PHONE, SHARE_CODE, "1234", null)).isFalse();
        assertThat(LinkedMobileVerifier.matches(PHONE, SHARE_CODE, "  ", hash)).isFalse();
    }

    @Test
    void aHashComparisonIgnoresCaseAndSurroundingSpace() {
        String hash = LinkedMobileVerifier.hash(PHONE, SHARE_CODE, 4);

        assertThat(LinkedMobileVerifier.matches(PHONE, SHARE_CODE, "1234", "  " + hash.toUpperCase() + " "))
                .isTrue();
    }
}
