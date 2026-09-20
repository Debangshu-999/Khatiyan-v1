package com.khatiyan.d_modules.verification.provider.decentro;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.verification.provider.AadhaarOkycProvider;
import com.khatiyan.d_modules.verification.provider.OkycOutcome;
import com.khatiyan.d_modules.verification.provider.OtpChallenge;
import com.khatiyan.d_modules.verification.provider.StartOtpCommand;
import com.khatiyan.d_modules.verification.provider.SubmitOtpCommand;
import com.khatiyan.d_modules.verification.service.VerificationProperties;

import lombok.extern.slf4j.Slf4j;
// Jackson 3: Boot 4's RestClient converters produce tools.jackson types.
import tools.jackson.databind.JsonNode;

/**
 * Decentro, who hold the OVSE registration we are verifying under.
 *
 * <p><b>A share code is always sent.</b> It does two things at once: it salts
 * the mobile hash so the number is returned as {@code hashedMobileNumber}
 * rather than in the clear, and it suppresses the PDF and its password from the
 * response. Both are what we want — we confirm a phone we already hold instead
 * of being handed one, and a document we never receive is a document we cannot
 * leak.
 *
 * <p><b>Nothing from the response is kept beyond what the port returns.</b>
 * Decentro sends back a photograph, a signed Aadhaar zip and a full address
 * bundle. The photo and the zip are read past and discarded, and the Aadhaar
 * number never appears at all — their reference carries only its last four
 * digits.
 *
 * <p>Errors come back as HTTP 400 with a {@code responseKey} naming the cause,
 * which is more useful than the message beside it, so the key is what gets
 * logged and mapped.
 */
@Slf4j
public class DecentroAadhaarOkycProvider implements AadhaarOkycProvider {

    /** Their date format, which is not ISO. */
    private static final DateTimeFormatter AADHAAR_DOB = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private static final String SUCCESS = "SUCCESS";

    private final RestClient restClient;
    private final DecentroProperties decentro;
    private final VerificationProperties properties;
    private final Clock clock;

    public DecentroAadhaarOkycProvider(
            RestClient.Builder restClientBuilder,
            DecentroProperties decentro,
            VerificationProperties properties,
            Clock clock) {
        // Bounded, because theirs is not ours to rely on. Without this we
        // inherited Decentro's patience with UIDAI — 45 seconds, measured —
        // and held a request thread for all of it.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(decentro.getConnectTimeout());
        requestFactory.setReadTimeout(decentro.getReadTimeout());
        this.restClient = restClientBuilder.requestFactory(requestFactory).build();
        this.decentro = decentro;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public OtpChallenge startOtp(StartOtpCommand command) {
        JsonNode response = post(
                "/v2/kyc/aadhaar/otp",
                Map.of(
                        "reference_id", command.reference(),
                        "consent", command.consentGiven(),
                        "purpose", command.purpose(),
                        "aadhaar_number", command.aadhaarNumber()));

        if (!SUCCESS.equals(response.path("status").asString(""))) {
            throw refusal(response);
        }

        return new OtpChallenge(
                response.path("decentroTxnId").asString(null),
                response.path("data").path("last3DigitsOfLinkedMobileNumber").asString(null),
                Instant.now(clock).plus(properties.getOtpValidityMinutes(), ChronoUnit.MINUTES));
    }

    @Override
    public OkycOutcome submitOtp(SubmitOtpCommand command) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reference_id", command.reference());
        body.put("consent", true);
        body.put("purpose", command.purpose());
        body.put("initiation_transaction_id", command.providerTransactionId());
        body.put("otp", command.otp());
        if (!properties.getShareCode().isBlank()) {
            // Salts the mobile hash and suppresses the PDF. See the class note.
            body.put("share_code", properties.getShareCode());
        }

        JsonNode response;
        try {
            response = post("/v2/kyc/aadhaar/otp/validate", body);
        } catch (BusinessException e) {
            // A wrong or expired code arrives as a 400 like any other refusal.
            // It is an ordinary outcome of asking somebody to read a text
            // message, so it comes back as a result rather than an exception.
            return OkycOutcome.rejected(e.getMessage());
        }

        if (!SUCCESS.equals(response.path("status").asString(""))) {
            return OkycOutcome.rejected(readableReason(response));
        }

        JsonNode data = response.path("data");
        JsonNode identity = data.path("proofOfIdentity");
        JsonNode address = data.path("proofOfAddress");

        return OkycOutcome.verified(
                identity.path("name").asString(null),
                parseDob(identity.path("dob").asString(null)),
                lastFourOf(data.path("aadhaarReferenceNumber").asString("")),
                oneLineAddress(address),
                blankToNull(address.path("pincode").asString("")),
                // Present only because a share code was sent. Without one they
                // return the number itself, which we deliberately do not want.
                identity.path("hashedMobileNumber").asString(null));
    }

    @Override
    public String name() {
        return "DECENTRO";
    }

    private JsonNode post(String path, Map<String, Object> body) {
        requireConfigured();
        try {
            JsonNode response = restClient.post()
                    .uri(decentro.getBaseUrl() + path)
                    .header("client_id", decentro.getClientId())
                    .header("client_secret", decentro.getClientSecret())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null) {
                throw new BusinessException(
                        "VERIFICATION_PROVIDER_ERROR", "The verification service did not answer. Try again.");
            }
            return response;
        } catch (RestClientResponseException e) {
            // They answered, and the answer was an error status. Logging only
            // "RestClientException" here made an authorisation failure and a
            // dead network look identical, which is the difference between a
            // wrong secret and a firewall.
            //
            // The ERROR body is safe to log: it carries their transaction id,
            // a response code and a message. The Aadhaar number is in the
            // REQUEST, which is never logged, and demographics only come back
            // on a 200, which never reaches here.
            log.warn(
                    "Decentro refused path={} status={} body={}",
                    path,
                    e.getStatusCode().value(),
                    abbreviate(e.getResponseBodyAsString()));
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR",
                    e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403
                            ? "Identity checks are not configured correctly. Please contact support."
                            : "The verification service refused that request. Try again in a moment.");
        } catch (RestClientException e) {
            // Nothing answered at all: DNS, a firewall, a timeout.
            log.warn(
                    "Decentro unreachable path={} error={} message={}",
                    path,
                    e.getClass().getSimpleName(),
                    e.getMessage());
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR",
                    "The verification service could not be reached. Try again in a moment.");
        }
    }

    /**
     * Their refusal, in words a tenant can act on.
     *
     * <p>Mapped from {@code responseKey} rather than their message, which is
     * written for a developer reading a log.
     */
    private BusinessException refusal(JsonNode response) {
        String key = response.path("responseKey").asString("");
        // Their codes verbatim, because that is what their support asks for
        // first. The user-facing sentence below is deliberately vaguer — a
        // tenant can do nothing with "E00026".
        log.warn(
                "Decentro refused responseKey={} responseCode={} decentroTxnId={} message={}",
                key,
                response.path("responseCode").asString(""),
                response.path("decentroTxnId").asString(""),
                response.path("message").asString(""));

        if (key.contains("mobile")) {
            return new BusinessException(
                    "VERIFICATION_NO_LINKED_MOBILE",
                    "There is no mobile number linked to this Aadhaar. "
                            + "Update it at an Aadhaar centre and try again.");
        }
        if (key.contains("aadhaar")) {
            return new BusinessException(
                    "VERIFICATION_BAD_AADHAAR", "That Aadhaar number was not accepted. Check the 12 digits.");
        }
        return new BusinessException("VERIFICATION_PROVIDER_ERROR", readableReason(response));
    }

    private String readableReason(JsonNode response) {
        String key = response.path("responseKey").asString("");
        log.warn(
                "Decentro validate failed responseKey={} responseCode={} decentroTxnId={} message={}",
                key,
                response.path("responseCode").asString(""),
                response.path("decentroTxnId").asString(""),
                response.path("message").asString(""));
        if (key.contains("otp")) {
            return "That code was not accepted. Check the message and try again.";
        }
        return "The check could not be completed. Try again.";
    }

    /**
     * The last four digits of the Aadhaar, from the reference they return.
     *
     * <p>UIDAI builds that reference as the last four digits followed by a
     * timestamp, so the fragment we are allowed to keep is already the first
     * four characters of it — and the full number is never in the response at
     * all.
     */
    static String lastFourOf(String aadhaarReferenceNumber) {
        if (aadhaarReferenceNumber == null || aadhaarReferenceNumber.length() < 4) {
            return null;
        }
        String candidate = aadhaarReferenceNumber.substring(0, 4);
        return candidate.matches("^[0-9]{4}$") ? candidate : null;
    }

    static LocalDate parseDob(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(raw.trim(), AADHAAR_DOB);
        } catch (DateTimeParseException e) {
            // Some records carry a year alone, which is a real Aadhaar state for
            // people enrolled without a birth certificate. Returning null lets
            // the caller fail the 18+ check honestly rather than guessing a day.
            log.info("Unparseable Aadhaar date of birth format={}", raw.length());
            return null;
        }
    }

    /**
     * The structured address, flattened into the one line our profile holds.
     *
     * <p>Parts in the order a letter would be addressed, blanks dropped, and
     * trimmed to the column's width. The pincode is carried separately, so it
     * is left off the line.
     */
    static String oneLineAddress(JsonNode address) {
        List<String> parts = new ArrayList<>();
        for (String field : List.of(
                "house", "street", "landmark", "locality", "vtc", "postOffice", "subDistrict", "district", "state")) {
            String value = address.path(field).asString("").trim();
            if (!value.isBlank() && !parts.contains(value)) {
                parts.add(value);
            }
        }
        if (parts.isEmpty()) {
            return null;
        }
        String line = String.join(", ", parts);
        return line.length() <= 300 ? line : line.substring(0, 300);
    }

    /** Enough of their error to act on, not enough to fill a log file. */
    private static String abbreviate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() <= 500 ? body : body.substring(0, 500) + "…";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireConfigured() {
        if (!decentro.isConfigured()) {
            throw new BusinessException(
                    "VERIFICATION_NOT_CONFIGURED", "Identity checks are not available right now.");
        }
    }
}
