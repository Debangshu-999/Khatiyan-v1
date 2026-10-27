package com.khatiyan.a_auth.model;

import java.time.Instant;

/**
 * What the auth filter needs to know about a session (2026-10-18).
 *
 * @param known whether a session row exists for the token at all
 * @param revoked whether it was signed out
 * @param expiresAt when its token expires, null when unknown
 */
public record SessionState(boolean known, boolean revoked, Instant expiresAt) {

    /** No row: a token minted before sessions existed, or an id nobody issued. Not revoked. */
    public static final SessionState UNKNOWN = new SessionState(false, false, null);

    public static SessionState of(UserSession session) {
        return new SessionState(true, session.isRevoked(), session.getExpiresAt());
    }

    public static SessionState revoked(Instant expiresAt) {
        return new SessionState(true, true, expiresAt);
    }
}
