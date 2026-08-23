package com.khatiyan.a_auth.service;

import java.util.List;

import com.khatiyan.a_auth.model.UserSession;
import com.khatiyan.c_shared.exception.BusinessException;

/**
 * Signing in would exceed the concurrent-device cap.
 *
 * <p>Carries the sessions themselves, because the caller has to CHOOSE which one
 * to end and cannot ask for the list — they are not signed in yet, so the normal
 * sessions endpoint is closed to them.
 *
 * <p>Handing over device labels before a token exists is safe here and only
 * here: this is thrown after the PIN or the e-mail code has been verified, so
 * whoever sees it has already proven the account is theirs. Thrown any earlier
 * it would be both an enumeration oracle and a leak of somebody's devices.
 */
public class SessionLimitReachedException extends BusinessException {

    /** Stable code the client switches on to raise the device picker. */
    public static final String CODE = "SESSION_LIMIT_REACHED";

    private final transient List<UserSession> sessions;

    public SessionLimitReachedException(List<UserSession> sessions) {
        super(CODE, "You are signed in on " + sessions.size() + " devices, which is the limit.");
        this.sessions = List.copyOf(sessions);
    }

    public List<UserSession> getSessions() {
        return sessions;
    }
}
