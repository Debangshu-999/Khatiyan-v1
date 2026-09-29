package com.khatiyan.d_modules.verification.provider;

import java.util.Optional;

import tools.jackson.databind.JsonNode;

/**
 * An Aadhaar check through the Aadhaar App (offline verification, OVSE).
 *
 * <p>Unlike the OTP port this is not two synchronous calls. We open a session,
 * the tenant is sent into the Aadhaar App on their own phone to consent (and
 * pass its face check), and the provider posts the result back to our callback.
 * So the port has three parts: open, read a callback, and ask about a session
 * whose callback has not come.
 *
 * <p>Spec: docs/superpowers/specs/2026-09-27-aadhaar-app-ovse-design.md
 */
public interface AadhaarAppProvider {

    /**
     * Opens a session and returns where to send the tenant.
     *
     * @throws com.khatiyan.c_shared.exception.BusinessException when the
     *         provider refuses before opening one. Nothing is charged then.
     */
    SessionHandle startSession(StartSessionCommand command);

    /**
     * Reads a result the provider posted to our callback.
     *
     * <p>Authenticity is established before this is called: the callback URL
     * carries a one-time token only this attempt knows.
     */
    Optional<CredentialOutcome> readCallback(JsonNode body);

    /**
     * Asks the provider about a session whose callback has not arrived.
     * Empty when they have no answer yet, or offer no way to ask.
     */
    Optional<CredentialOutcome> fetchSession(String providerSessionId, String referenceId);

    /** Which provider this is, for logs and the audit trail. */
    String name();

    /**
     * Whether the provider still knows this session. A reused session it has
     * forgotten would send the tenant to a dead page. Real providers keep
     * theirs until expiry, so the default is yes.
     */
    default boolean isSessionLive(String providerSessionId) {
        return true;
    }
}
