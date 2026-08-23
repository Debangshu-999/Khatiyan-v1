package com.khatiyan.a_auth.api.dto;

import java.time.Instant;
import java.util.List;

/**
 * The body returned when a sign-in hits the device cap.
 *
 * <p>A deliberate SUPERSET of {@code ErrorResponse}: same {@code code},
 * {@code message} and {@code timestamp} in the same places, plus the devices to
 * choose from. Clients that only know how to read an error still read this one
 * correctly and show the message; the sign-in screen reads the extra field and
 * offers the picker.
 */
public record SessionLimitResponse(
    String code,
    String message,
    List<UserSessionResponse> sessions,
    Instant timestamp
) {

    public static SessionLimitResponse of(String code, String message, List<UserSessionResponse> sessions) {
        return new SessionLimitResponse(code, message, sessions, Instant.now());
    }
}
