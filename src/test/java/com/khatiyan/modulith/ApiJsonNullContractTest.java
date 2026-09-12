package com.khatiyan.modulith;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.support.IntegrationTest;

/**
 * The API sends nulls, and the frontend's types say so.
 *
 * <p><b>The contract.</b> {@code spring.jackson.default-property-inclusion} is
 * ALWAYS, deliberately. Under {@code non_null} every null field was dropped
 * from the response, so a field the client types as {@code T | null} arrived as
 * {@code undefined} instead: {@code x === null} never matched, and reads like
 * {@code x.length} blew up on whichever record happened to have a null. It was
 * data-dependent, so it surfaced as rare unreproducible TypeErrors rather than
 * as anything anyone could chase. Every TypeScript type in
 * {@code frontend/src/store/services} was written against the fixed behaviour.
 *
 * <p><b>Why now.</b> Hazard #4 of the Spring Boot 4.1 upgrade
 * (see {@code docs/Spring AI/ai-intelligence-platform-spec.md} §6.2). Boot 4
 * ships Jackson 3, whose defaults and configuration surface both move. If the
 * setting stops applying, nothing fails: responses simply get smaller, and the
 * app breaks in the browser weeks later on a record that happened to have a
 * null in it.
 *
 * <p>The same setting also governs what is written into
 * {@code event_publication} — see {@link EventPayloadCompatibilityTest}, whose
 * pinned payloads contain explicit nulls. This is not only a wire contract.
 *
 * <p><b>Behaviour, not configuration.</b> These assert what comes out of the
 * mapper rather than what its config object reports, because the config API is
 * one of the things Jackson 3 changes — a test reading it would fail to compile
 * and get "fixed" by rewriting the assertion, which is the wrong outcome.
 */
@IntegrationTest
@DisplayName("the API JSON null contract")
class ApiJsonNullContractTest {

    /** Shaped like a response DTO: nullable scalar, nullable list, nested record. */
    record Nested(String label, String note) {}

    record SampleResponse(
            String id,
            String presentValue,
            String absentValue,
            Integer absentNumber,
            List<String> absentList,
            Nested nested) {}

    @Autowired private ObjectMapper objectMapper;

    @Test
    @DisplayName("keeps null fields in the payload")
    void nullsAreWritten() throws Exception {
        String json = objectMapper.writeValueAsString(new SampleResponse(
                "abc", "here", null, null, null, new Nested("x", null)));

        assertThat(json)
                .as("Null fields are being dropped. Every frontend type declaring "
                        + "`T | null` now receives undefined instead, which is the bug "
                        + "spring.jackson.default-property-inclusion=always exists to "
                        + "prevent.")
                .contains("\"absentValue\":null")
                .contains("\"absentNumber\":null")
                .contains("\"absentList\":null")
                .contains("\"note\":null");
    }

    @Test
    @DisplayName("still writes the fields that have values")
    void valuesSurvive() throws Exception {
        String json = objectMapper.writeValueAsString(new SampleResponse(
                "abc", "here", null, null, null, new Nested("x", null)));

        // The cheap half of the check: a mapper that wrote everything as null
        // would satisfy the test above.
        assertThat(json).contains("\"id\":\"abc\"").contains("\"presentValue\":\"here\"");
    }
}
