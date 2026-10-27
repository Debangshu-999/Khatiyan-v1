package com.khatiyan.d_modules.property.service;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Property inventory gate: acquire before room, departure/request and hold row locks. */
@Component
public class RoomInventoryLock {
    private final JdbcTemplate jdbc;

    public RoomInventoryLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void acquire(UUID propertyId) {
        if (propertyId == null || !TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Room inventory requires a property and an active transaction");
        }
        // Transaction-scoped and reentrant. A property-level gate also makes
        // two-room transfers take the same order as one-room allocations.
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { },
                "room-inventory:" + propertyId);
    }
}
