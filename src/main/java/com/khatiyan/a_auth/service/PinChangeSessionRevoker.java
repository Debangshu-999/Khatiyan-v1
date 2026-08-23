package com.khatiyan.a_auth.service;

import java.time.Instant;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.event.PinChangedEvent;

/**
 * Ends every recorded session when a PIN changes.
 *
 * <p>A PIN change already invalidates every issued token by bumping
 * {@code credentialVersion}. The tokens were dying correctly; the SESSION ROWS
 * did not know it, so the device list would have gone on advertising devices
 * that were signed out the instant the PIN changed.
 *
 * <p>Hung off the event rather than written into each caller because a PIN can
 * change through five paths — reset by OTP, reset by e-mail, deliberate change,
 * first-time set, and the Firebase route — and a path that forgot this would
 * leave a list quietly lying about where someone is signed in.
 *
 * <p>Synchronous {@code @EventListener}, not {@code @ApplicationModuleListener}:
 * this is auth reacting to itself, and it has to have happened before the
 * response carrying a fresh token goes out. Every publisher fires the event
 * BEFORE issuing that token, so the session opened moments later survives.
 */
@Component
public class PinChangeSessionRevoker {

    private final UserSessionService userSessionService;

    public PinChangeSessionRevoker(UserSessionService userSessionService) {
        this.userSessionService = userSessionService;
    }

    @EventListener
    public void onPinChanged(PinChangedEvent event) {
        userSessionService.revokeAll(event.userId(), Instant.now());
    }
}
