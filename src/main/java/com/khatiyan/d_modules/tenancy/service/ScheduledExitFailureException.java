package com.khatiyan.d_modules.tenancy.service;

/** A safe, retryable reason why a configured tenancy exit could not run. */
public class ScheduledExitFailureException extends RuntimeException {

    private final String code;

    public ScheduledExitFailureException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
