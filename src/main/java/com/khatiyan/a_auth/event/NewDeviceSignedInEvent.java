package com.khatiyan.a_auth.event;

import java.util.UUID;

/**
 * Someone signed in from a device this account has never been used on.
 *
 * <p>The security signal that matters: a stolen PIN is invisible until a session
 * appears somewhere the owner does not recognise, and this is the only moment
 * the app can say so.
 *
 * <p>NOT published on every sign-in. Signing out and back in on the same phone
 * is the ordinary case, and alerting on it would train people to ignore the one
 * alert that means something. Nor on the FIRST device — there is nothing to
 * compare it against, and "you signed in" is not news to whoever just did.
 */
public record NewDeviceSignedInEvent(
    UUID userId,
    /** As the device described itself. Client-supplied, so display only. */
    String deviceLabel
) {
}
