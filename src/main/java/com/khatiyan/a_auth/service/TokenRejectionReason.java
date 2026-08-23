package com.khatiyan.a_auth.service;

/**
 * Why a presented Bearer token was refused.
 *
 * <p>Recorded by {@link JwtAuthenticationFilter} on the request and read back by
 * the authentication entry point, which is the only place that knows whether the
 * refusal actually mattered — a stale token on a {@code permitAll} route never
 * reaches the entry point, and must not be turned into a 401.
 *
 * <p>The names are the {@code code} on the error body, so a client can tell
 * "sign in again" apart from "you were signed out elsewhere" without parsing
 * prose.
 */
public enum TokenRejectionReason {

    /** Unparseable, tampered with, or past its expiry. */
    TOKEN_INVALID,

    /** Parsed fine, but the user is gone or deactivated. */
    USER_INACTIVE,

    /**
     * Parsed fine, user is active, but the token predates a credential change —
     * a PIN reset on another device, typically.
     */
    CREDENTIALS_STALE,

    /** This particular session was signed out from another device. */
    SESSION_REVOKED;

    /** Request attribute the filter writes and the entry point reads. */
    public static final String ATTRIBUTE = "khatiyan.tokenRejectionReason";

    /** What the person holding this token should be told. */
    public String message() {
        return switch (this) {
            case USER_INACTIVE -> "This account is no longer active. Sign in again.";
            case CREDENTIALS_STALE -> "Your credentials changed elsewhere. Sign in again.";
            case SESSION_REVOKED -> "This device was signed out. Sign in again.";
            case TOKEN_INVALID -> "Your session has expired. Sign in again.";
        };
    }
}
