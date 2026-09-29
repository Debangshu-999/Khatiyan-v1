package com.khatiyan.c_shared.exception;

/**
 * An action on an existing record arrived without the version its screen was
 * showing (2026-09-29). Answered with 428: an out-of-date app build, or a
 * screen that never loaded the record. Refreshing fixes both.
 */
public class VersionRequiredException extends RuntimeException {

    public static final String CODE = "VERSION_REQUIRED";
    public static final String MESSAGE = "This screen is out of date. Refresh and try again.";

    public VersionRequiredException() {
        super(MESSAGE);
    }
}
