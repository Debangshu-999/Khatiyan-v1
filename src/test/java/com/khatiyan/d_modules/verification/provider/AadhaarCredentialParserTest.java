package com.khatiyan.d_modules.verification.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.verification.provider.DevAadhaarAppProvider.DevOutcome;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Aadhaar App result, read the way Decentro documents it.
 *
 * <p>Written against their published example, not a staging body: the point is
 * that the attributes are found wherever the envelope puts them.
 */
class AadhaarCredentialParserTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Test
    void aSharedCredentialIsReadInFull() {
        CredentialOutcome outcome = AadhaarCredentialParser.parse(DevAadhaarAppProvider.resultBody(
                "khatiyan-1", DevOutcome.SHARE, "Asha Roy", "15/06/1995", "F", "XXXXX-X1234")).orElseThrow();

        assertThat(outcome.succeeded()).isTrue();
        assertThat(outcome.referenceId()).isEqualTo("khatiyan-1");
        assertThat(outcome.name()).isEqualTo("Asha Roy");
        assertThat(outcome.dateOfBirth()).isEqualTo(LocalDate.of(1995, 6, 15));
        assertThat(outcome.gender()).isEqualTo(Gender.FEMALE);
        assertThat(outcome.maskedMobile()).isEqualTo("XXXXX-X1234");
        assertThat(outcome.ageAbove18()).isTrue();
        assertThat(outcome.faceMatched()).isTrue();
    }

    @Test
    void theAttributesAreFoundAtTheTopLevelToo() throws Exception {
        JsonNode body = MAPPER.readTree("""
                { "referenceId": "khatiyan-2", "residentName": "Ravi Das", "dob": "1990-01-31",
                  "gender": "M", "address": "12 Park Street, Kolkata 700016", "ageAbove18": "Yes" }
                """);

        CredentialOutcome outcome = AadhaarCredentialParser.parse(body).orElseThrow();

        assertThat(outcome.succeeded()).isTrue();
        assertThat(outcome.dateOfBirth()).isEqualTo(LocalDate.of(1990, 1, 31));
        assertThat(outcome.gender()).isEqualTo(Gender.MALE);
        assertThat(outcome.faceMatched()).isNull();
    }

    @Test
    void aDeclineSaysWhyInPlainWords() {
        assertThat(AadhaarCredentialParser.parse(DevAadhaarAppProvider.resultBody(
                "khatiyan-3", DevOutcome.DECLINE, null, null, null, null)).orElseThrow())
                .satisfies(outcome -> {
                    assertThat(outcome.succeeded()).isFalse();
                    assertThat(outcome.referenceId()).isEqualTo("khatiyan-3");
                    assertThat(outcome.failureReason()).contains("consent");
                });
        assertThat(AadhaarCredentialParser.parse(DevAadhaarAppProvider.resultBody(
                "khatiyan-4", DevOutcome.FACE_FAILS, null, null, null, null)).orElseThrow().failureReason())
                .contains("face check");
    }

    /**
     * Seen 2026-09-27: Decentro posts this when a session is created, before
     * the tenant has done anything. It is not a result.
     */
    @Test
    void theSessionCreatedCallbackIsNotAResult() throws Exception {
        JsonNode body = MAPPER.readTree("""
                { "decentroTxnId": "81FE4E834D2046FABFFB4C73045BAF91", "status": "SUCCESS",
                  "responseCode": "S00000", "responseKey": "success_aadhaar_session_generation",
                  "data": { "url": "https://in.staging.decentro.tech/session/81FE", "qrExpiry": "2026-07-10T10:01:11Z" } }
                """);

        assertThat(AadhaarCredentialParser.parse(body)).isEmpty();
        assertThat(AadhaarCredentialParser.shapeOf(body))
                .contains("data.url")
                .contains("success_aadhaar_session_generation")
                .doesNotContain("in.staging.decentro.tech");
    }

    /** An expired session is left to our own expiry, which gives the attempt back. */
    @Test
    void anExpiredSessionIsNotADecline() throws Exception {
        JsonNode body = MAPPER.readTree("""
                { "status": "EXPIRED", "message": "User did not complete Aadhaar verification." }
                """);

        assertThat(AadhaarCredentialParser.parse(body)).isEmpty();
    }

    /** A year alone is not a date: the 18+ check must fail honestly, not on a guessed day. */
    @Test
    void aYearAloneIsNoDateOfBirth() {
        assertThat(AadhaarCredentialParser.parseDob("1995")).isNull();
    }
}
