package com.khatiyan.d_modules.verification.provider.decentro;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/**
 * The parts of the adapter that turn their shapes into ours.
 *
 * <p>Nothing here makes a call. What is worth testing without a network is the
 * translation — a date format that is not ISO, an address that arrives in
 * twelve pieces, and an Aadhaar fragment that has to be taken from a reference
 * rather than from the number, because the number is never sent.
 */
class DecentroAadhaarOkycProviderTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    // ---- their date format --------------------------------------------------

    @Test
    void theirDateFormatIsNotIso() {
        assertThat(DecentroAadhaarOkycProvider.parseDob("15-06-1995")).isEqualTo(LocalDate.of(1995, 6, 15));
    }

    /**
     * A real Aadhaar state: somebody enrolled without a birth certificate can
     * carry a year alone. Guessing a day would put a made-up date on a
     * tenancy, so this fails the 18+ check honestly instead.
     */
    @Test
    void aDateWeCannotReadBecomesNoDateRatherThanAGuess() {
        assertThat(DecentroAadhaarOkycProvider.parseDob("1995")).isNull();
        assertThat(DecentroAadhaarOkycProvider.parseDob("")).isNull();
        assertThat(DecentroAadhaarOkycProvider.parseDob(null)).isNull();
    }

    // ---- the only fragment of the number we may keep ------------------------

    /**
     * UIDAI builds the reference as the last four digits followed by a
     * timestamp, so the fragment we are allowed to keep is already the front of
     * it — and the full number is never in the response at all.
     */
    @Test
    void theLastFourComeFromTheReferenceNotTheNumber() {
        assertThat(DecentroAadhaarOkycProvider.lastFourOf("441720260919103000")).isEqualTo("4417");
    }

    @Test
    void anUnexpectedReferenceYieldsNothingRatherThanRubbish() {
        assertThat(DecentroAadhaarOkycProvider.lastFourOf("ABC")).isNull();
        assertThat(DecentroAadhaarOkycProvider.lastFourOf("XXXX20260919")).isNull();
        assertThat(DecentroAadhaarOkycProvider.lastFourOf(null)).isNull();
    }

    // ---- twelve fields into the one line our profile holds ------------------

    @Test
    void theAddressIsFlattenedInTheOrderALetterWouldBeAddressed() {
        String address = DecentroAadhaarOkycProvider.oneLineAddress(MAPPER.readTree("""
                {
                  "house": "12A",
                  "street": "Park Street",
                  "landmark": "Near the post office",
                  "locality": "Ballygunge",
                  "vtc": "Kolkata",
                  "postOffice": "Ballygunge",
                  "subDistrict": "Kolkata",
                  "district": "Kolkata",
                  "state": "West Bengal",
                  "pincode": "700019",
                  "country": "India",
                  "careOf": "S/O Someone"
                }
                """));

        // Pincode is carried separately, so it is not on the line. Repeats are
        // dropped: Aadhaar routinely puts the same town in three of these.
        assertThat(address)
                .isEqualTo("12A, Park Street, Near the post office, Ballygunge, Kolkata, West Bengal");
    }

    @Test
    void anEmptyAddressIsNothingRatherThanAStringOfCommas() {
        assertThat(DecentroAadhaarOkycProvider.oneLineAddress(MAPPER.readTree("{}"))).isNull();
        assertThat(DecentroAadhaarOkycProvider.oneLineAddress(MAPPER.readTree("""
                {"house": "", "state": "  "}
                """)))
                .isNull();
    }

    /** The column holds 300 characters, so the line has to. */
    @Test
    void aVeryLongAddressIsTrimmedToTheColumn() {
        // Two DIFFERENT long values: identical ones are deduplicated, which is
        // the behaviour above and would leave this test measuring one field.
        String house = "h".repeat(240);
        String street = "s".repeat(240);
        String address = DecentroAadhaarOkycProvider.oneLineAddress(
                MAPPER.readTree("{\"house\": \"" + house + "\", \"street\": \"" + street + "\"}"));

        assertThat(address).hasSize(300);
    }

    // ---- configuration ------------------------------------------------------

    @Test
    void aHalfConfiguredProviderKnowsItCannotCall() {
        DecentroProperties properties = new DecentroProperties();
        assertThat(properties.isConfigured()).isFalse();

        properties.setClientId("some-id");
        assertThat(properties.isConfigured()).isFalse();

        properties.setClientSecret("some-secret");
        assertThat(properties.isConfigured()).isTrue();
    }

    /** Staging, so a deployment that forgot to set it fails visibly. */
    @Test
    void theDefaultHostIsTheSafeOne() {
        assertThat(new DecentroProperties().getBaseUrl()).contains("staging");
    }
}
