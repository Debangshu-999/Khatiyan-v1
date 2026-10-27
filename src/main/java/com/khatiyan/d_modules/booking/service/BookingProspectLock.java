package com.khatiyan.d_modules.booking.service;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * One person's booking writes, one at a time.
 *
 * <p>Several rules count a person's rows before adding one: two requests per
 * visit, one open request per property, one confirmed booking across the app.
 * Two taps at the same moment would each count before the other wrote. Every
 * write that adds or confirms a booking for a person takes this first, so the
 * count it reads is still true when it writes. The unique indexes stay as the
 * backstop.
 *
 * <p>Acquire it before any inventory lock: a person, then a property.
 */
@Component
public class BookingProspectLock {
    private final JdbcTemplate jdbc;

    public BookingProspectLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void acquire(UUID prospectUserId) {
        if (prospectUserId == null || !TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("A booking write requires a person and an active transaction");
        }
        // Transaction-scoped and reentrant, like the room inventory gate.
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { },
                "booking-prospect:" + prospectUserId);
    }
}
