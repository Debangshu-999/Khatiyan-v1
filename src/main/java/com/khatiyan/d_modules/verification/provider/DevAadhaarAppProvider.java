package com.khatiyan.d_modules.verification.provider;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.khatiyan.d_modules.verification.service.VerificationProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A stand-in for the Aadhaar App, served by our own backend.
 *
 * <p>Not a mock: the whole loop runs for real. A session is opened, the app is
 * sent to an intent link, a result is posted to the callback with its one-time
 * token, and the service applies it with the same rules as a real provider. The
 * only difference is that the "Aadhaar App" is a page on this server with a
 * button for each outcome worth testing (a pass, a different name, under 18, a
 * failed face check, a refusal), because none of them can be produced on demand
 * with a real Aadhaar.
 *
 * <p>The result it posts is shaped like Decentro's documented one and read by
 * the same {@link AadhaarCredentialParser}, so the parser is exercised too.
 *
 * <p>Sessions live in memory. A restart forgets them, which is fine for a
 * development stand-in: the sweep closes the attempts they belonged to.
 */
public class DevAadhaarAppProvider implements AadhaarAppProvider {

    /** One open stand-in session: what the dev page needs to post a result. */
    public record DevSession(
            String referenceId, String requestedName, String callbackUrl, String returnUrl, Instant expiresAt) {
    }

    /** What the stand-in page can make the "Aadhaar App" do. */
    public enum DevOutcome {
        /** The tenant consents and the face check passes. */
        SHARE,
        /** The face check does not pass, so nothing is shared. */
        FACE_FAILS,
        /** The tenant says no in the Aadhaar App. */
        DECLINE
    }

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private final Clock clock;
    private final VerificationProperties properties;
    private final Map<String, DevSession> sessions = new ConcurrentHashMap<>();

    public DevAadhaarAppProvider(Clock clock, VerificationProperties properties) {
        this.clock = clock;
        this.properties = properties;
    }

    @Override
    public SessionHandle startSession(StartSessionCommand command) {
        String sessionId = "dev-" + UUID.randomUUID();
        Instant expiresAt = Instant.now(clock).plus(properties.getSessionValidityMinutes(), ChronoUnit.MINUTES);
        sessions.put(sessionId, new DevSession(
                command.referenceId(), command.name(), command.callbackUrl(), command.returnUrl(), expiresAt));
        return new SessionHandle(
                sessionId,
                pageBase() + "/api/v1/verification/dev-sessions/" + sessionId,
                expiresAt);
    }

    /**
     * Where the phone can reach this server: the address the app itself used
     * for the request that opened the session. The configured public base URL
     * defaults to localhost, which on a phone is the phone (seen 2026-09-27: a
     * broken page in the browser). Outside a request, the configured one.
     */
    static String pageBase(String configured) {
        try {
            return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        } catch (IllegalStateException noRequest) {
            return configured;
        }
    }

    private String pageBase() {
        return pageBase(properties.getPublicBaseUrl());
    }

    @Override
    public Optional<CredentialOutcome> readCallback(JsonNode body) {
        return AadhaarCredentialParser.parse(body);
    }

    /** The stand-in posts its result straight to the callback, so there is never anything to fetch. */
    @Override
    public Optional<CredentialOutcome> fetchSession(String providerSessionId, String referenceId) {
        return Optional.empty();
    }

    @Override
    public String name() {
        return "DEV";
    }

    /** Sessions live in memory, so a backend restart forgets them. */
    @Override
    public boolean isSessionLive(String providerSessionId) {
        return providerSessionId != null && session(providerSessionId).isPresent();
    }

    /** The open session behind a dev page, if it has not expired. */
    public Optional<DevSession> session(String sessionId) {
        DevSession session = sessions.get(sessionId);
        if (session == null || Instant.now(clock).isAfter(session.expiresAt())) {
            return Optional.empty();
        }
        return Optional.of(session);
    }

    /**
     * A result shaped like Decentro's documented callback, for the dev page and
     * the tests. A different name or an under-18 date of birth is just a field
     * typed differently on the page.
     *
     * @param dob    dd/MM/yyyy, as the Aadhaar App shares it
     * @param gender M, F or T
     */
    public static JsonNode resultBody(
            String referenceId, DevOutcome outcome, String name, String dob, String gender, String maskedMobile) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("decentroTxnId", "DEV" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        body.put("reference_id", referenceId);
        if (outcome != DevOutcome.SHARE) {
            body.put("status", "FAILURE");
            body.put("responseKey", outcome == DevOutcome.FACE_FAILS
                    ? "error_face_authentication_failed"
                    : "error_consent_denied");
            return MAPPER.valueToTree(body);
        }

        Map<String, Object> address = new LinkedHashMap<>();
        address.put("house", "12");
        address.put("street", "Dev Street");
        address.put("locality", "Test Locality");
        address.put("vtc", "Kolkata");
        address.put("district", "Kolkata");
        address.put("state", "West Bengal");
        address.put("pincode", "700001");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("residentName", name);
        data.put("dob", dob);
        data.put("gender", gender);
        data.put("address", address);
        data.put("maskedMobile", maskedMobile);
        data.put("ageAbove18", AadhaarCredentialParser.parseDob(dob) != null
                && !AadhaarCredentialParser.parseDob(dob).plusYears(18).isAfter(java.time.LocalDate.now())
                ? "yes" : "no");
        data.put("faceMatch", "yes");

        body.put("status", "SUCCESS");
        body.put("responseKey", "success_aadhaar_session");
        body.put("data", data);
        return MAPPER.valueToTree(body);
    }

    /** A session answers once, like the real thing. */
    public void close(String sessionId) {
        sessions.remove(sessionId);
    }
}
