package com.khatiyan.d_modules.verification.provider.decentro;

import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.verification.provider.AadhaarAppProvider;
import com.khatiyan.d_modules.verification.provider.AadhaarCredentialParser;
import com.khatiyan.d_modules.verification.provider.AadhaarIntentLinks;
import com.khatiyan.d_modules.verification.provider.CredentialOutcome;
import com.khatiyan.d_modules.verification.provider.SessionHandle;
import com.khatiyan.d_modules.verification.provider.StartSessionCommand;
import com.khatiyan.d_modules.verification.service.VerificationProperties;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;

/**
 * Decentro's "Aadhaar OVSE: QR Code Intent Flow".
 *
 * <p>{@code POST /v2/kyc/aadhaar/session} opens a session and answers with an
 * intent link into the Aadhaar App ({@code qrUrl}) and an expiry
 * ({@code qrExpiry}). The tenant consents in the Aadhaar App, face check
 * included, and Decentro posts the credential to our callback.
 *
 * <p><b>Written from their published reference, not a staging run.</b> Still
 * open with them (spec §9): how the callback is authenticated (ours is by the
 * one-time token in its URL regardless), whether there is a status endpoint
 * (so {@link #fetchSession} answers nothing for now), what exactly is billed,
 * and whether staging simulates the Aadhaar App.
 *
 * <p>The QR image they also return is ignored: the Aadhaar App must be on the
 * tenant's own phone (owner's rule, 2026-09-27).
 */
@Slf4j
public class DecentroAadhaarAppProvider implements AadhaarAppProvider {

    private static final String SESSION_PATH = "/v2/kyc/aadhaar/session";

    private final RestClient restClient;
    private final DecentroProperties decentro;
    private final VerificationProperties properties;
    private final Clock clock;

    public DecentroAadhaarAppProvider(
            RestClient.Builder restClientBuilder,
            DecentroProperties decentro,
            VerificationProperties properties,
            Clock clock) {
        // Bounded, for the same reason as the OTP adapter: their patience with
        // UIDAI is not ours to inherit.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(decentro.getConnectTimeout());
        requestFactory.setReadTimeout(decentro.getReadTimeout());
        this.restClient = restClientBuilder.requestFactory(requestFactory).build();
        this.decentro = decentro;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public SessionHandle startSession(StartSessionCommand command) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reference_id", command.referenceId());
        body.put("consent", true);
        body.put("purpose", command.purpose());
        body.put("name", command.name());
        body.put("language", "en");
        body.put("callback_url", command.callbackUrl());
        body.put("redirect_url", command.returnUrl());
        body.put("face_authentication", command.faceAuthentication());

        JsonNode response = post(body);
        if ("FAILURE".equalsIgnoreCase(response.path("status").asString(""))) {
            log.warn(
                    "Decentro refused session responseKey={} responseCode={} decentroTxnId={} message={}",
                    response.path("responseKey").asString(""),
                    response.path("responseCode").asString(""),
                    response.path("decentroTxnId").asString(""),
                    response.path("message").asString(""));
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR", "The Aadhaar check could not be started. Try again in a moment.");
        }

        // The documented keys, found at the top level or under "data".
        JsonNode data = response.has("qrUrl") ? response : response.path("data");
        String intentUrl = data.path("qrUrl").asString(null);
        if (intentUrl == null || intentUrl.isBlank()) {
            log.warn("Decentro session answered without an intent link decentroTxnId={}",
                    response.path("decentroTxnId").asString(""));
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR", "The Aadhaar check could not be started. Try again in a moment.");
        }
        // Their link is the QR form, which goes nowhere on the same phone. The
        // Aadhaar App's own link carries the decoded request instead.
        String handOff = AadhaarIntentLinks.webIntentFor(intentUrl).orElse(intentUrl);
        if (handOff.equals(intentUrl)) {
            log.warn("Decentro session link could not be decoded, handing it on as given decentroTxnId={}",
                    response.path("decentroTxnId").asString(""));
        }
        return new SessionHandle(sessionIdOf(response, data), handOff, expiryOf(data));
    }

    @Override
    public Optional<CredentialOutcome> readCallback(JsonNode body) {
        return AadhaarCredentialParser.parse(body);
    }

    /**
     * Not documented. Empty until Decentro names a status endpoint; the callback
     * and the expiry sweep carry the flow until then.
     */
    @Override
    public Optional<CredentialOutcome> fetchSession(String providerSessionId, String referenceId) {
        return Optional.empty();
    }

    @Override
    public String name() {
        return "DECENTRO";
    }

    /** Their session id: the last part of the hosted session URL, else their transaction id. */
    private static String sessionIdOf(JsonNode response, JsonNode data) {
        String url = data.path("url").asString("");
        if (!url.isBlank()) {
            String trimmed = url.replaceAll("/+$", "");
            return trimmed.substring(trimmed.lastIndexOf('/') + 1);
        }
        String txn = response.path("decentroTxnId").asString("");
        return txn.isBlank() ? null : txn;
    }

    private Instant expiryOf(JsonNode data) {
        String raw = data.path("qrExpiry").asString("");
        if (!raw.isBlank()) {
            try {
                return Instant.parse(raw);
            } catch (DateTimeParseException ignored) {
                // Fall through to our own window.
            }
        }
        return Instant.now(clock).plus(properties.getSessionValidityMinutes(), ChronoUnit.MINUTES);
    }

    private JsonNode post(Map<String, Object> body) {
        if (decentro.getClientId().isBlank() || decentro.getClientSecret().isBlank()) {
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR", "Identity checks are not configured correctly. Please contact support.");
        }
        try {
            JsonNode response = restClient.post()
                    .uri(decentro.getBaseUrl() + SESSION_PATH)
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
            // Safe to log: an error body carries their ids and a message, never
            // a person's details, which only come back on the callback.
            String responseBody = e.getResponseBodyAsString();
            log.warn(
                    "Decentro refused path={} status={} body={}",
                    SESSION_PATH,
                    e.getStatusCode().value(),
                    responseBody.length() <= 500 ? responseBody : responseBody.substring(0, 500) + "…");
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR",
                    e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403
                            ? "Identity checks are not configured correctly. Please contact support."
                            : "The verification service refused that request. Try again in a moment.");
        } catch (RestClientException e) {
            log.warn("Decentro unreachable path={} error={} message={}",
                    SESSION_PATH, e.getClass().getSimpleName(), e.getMessage());
            throw new BusinessException(
                    "VERIFICATION_PROVIDER_ERROR", "The verification service could not be reached. Try again in a moment.");
        }
    }
}
