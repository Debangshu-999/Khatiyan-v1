package com.khatiyan.c_shared.exception;

/**
 * The record changed since the client's screen loaded it (2026-09-28).
 *
 * <p>Answered with 409 and code {@value #CODE}, the same answer a same-moment
 * race gets when its save fails on the row's version. The app then refetches
 * and shows {@link #MESSAGE}.
 */
public class StaleVersionException extends RuntimeException {

    public static final String CODE = "STALE";
    public static final String MESSAGE = "The data has changed since you opened it. Refresh and try again.";

    public StaleVersionException() {
        super(MESSAGE);
    }
}
