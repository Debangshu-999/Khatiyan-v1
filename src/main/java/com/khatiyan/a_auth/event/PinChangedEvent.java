package com.khatiyan.a_auth.event;

import java.util.UUID;

/**
 * Published when a user sets or resets their PIN.
 *
 * <p>Listeners can later use this for security alerts or audit logging.
 * The credential version is updated on the user entity so old JWTs can
 * be rejected after the change.
 */
public record PinChangedEvent(
    UUID userId
) {}
