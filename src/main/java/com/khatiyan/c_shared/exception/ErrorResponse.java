package com.khatiyan.c_shared.exception;

import java.time.Instant;
import java.util.List;

/**
 * Standard error response shape for the API.
 *
 * <p>{@code code} is a machine-readable identifier; {@code message}
 * is human-readable; {@code fieldErrors} is populated only for
 * validation failures.
 */
public record ErrorResponse(
    String code,
    String message,
    List<FieldError> fieldErrors,
    Instant timestamp
) {

    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(code, message, null, Instant.now());
    }

    public static ErrorResponse withFieldErrors(String code, String message, List<FieldError> fieldErrors) {
        return new ErrorResponse(code, message, fieldErrors, Instant.now());
    }

    public record FieldError(String field, String message) {}
}
