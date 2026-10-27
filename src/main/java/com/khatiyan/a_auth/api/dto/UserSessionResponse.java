package com.khatiyan.a_auth.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.a_auth.model.UserSession;

/**
 * One row in the signed-in devices list.
 *
 * <p>Carries no token and no {@code jti}: the id here is the SESSION ROW's id,
 * which is what a revoke call names. Handing the client the jti would be handing
 * it a piece of somebody's credential for no reason.
 */
public record UserSessionResponse(
    UUID id,
    String deviceLabel,
    String platform,
    Instant createdAt,
    Instant lastSeenAt,
    Instant expiresAt,
    /** True for the session making this request — shown as "This device". */
    boolean current
) {

    public static UserSessionResponse from(UserSession session, UUID callerSessionId) {
        return from(session, callerSessionId, null);
    }

    /**
     * With the last request time from the auth cache (2026-10-18), which is
     * fresher than the row's. The row's is shown when the cache has none.
     */
    public static UserSessionResponse from(UserSession session, UUID callerSessionId, Instant lastSeenAt) {
        return new UserSessionResponse(
            session.getId(),
            session.getDeviceLabel(),
            session.getPlatform(),
            session.getCreatedAt(),
            lastSeenAt == null ? session.getLastSeenAt() : lastSeenAt,
            session.getExpiresAt(),
            session.getJti().equals(callerSessionId));
    }
}
