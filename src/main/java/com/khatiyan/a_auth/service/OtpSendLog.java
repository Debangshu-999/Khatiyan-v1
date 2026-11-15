package com.khatiyan.a_auth.service;

import java.time.Instant;

/** The record of code requests that {@link OtpSendSchedule} reads (user, 2026-11-14). */
public interface OtpSendLog {

    /** How many requests since {@code since}, and when the latest was. */
    record Window(long count, Instant latest) {}

    Window window(String identifier, String scope, Instant since);

    /** Holds the identifier for the rest of the transaction, so two requests cannot both pass. */
    void lock(String identifier, String scope);

    void record(String identifier, String scope, Instant at);

    void purgeBefore(Instant cutoff);
}
