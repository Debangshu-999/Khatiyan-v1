package com.khatiyan.c_shared.valkey;

/**
 * Told when Valkey goes down and before it is used again (2026-10-18).
 *
 * <p>Whatever holds a memory copy empties it on both: memory only answers while
 * Valkey is down, and must not carry anything from one outage into the next.
 */
public interface ValkeyOutageListener {

    /** Valkey has just stopped answering. */
    default void onValkeyDown() {
    }

    /**
     * Valkey answers again and is about to be trusted. Throwing keeps it down
     * and it is tried again later, so nothing reads Valkey until every listener
     * has finished here.
     */
    default void onValkeyRecovering() {
    }
}
