package com.khatiyan.d_modules.concerns.model;

/**
 * Lifecycle state of a concern.
 *
 * <p>Concerns start as OPEN, can move through IN_PROGRESS, become RESOLVED
 * with a short reopen window, and finally settle as CLOSED.
 */
public enum ConcernStatus {
    OPEN,
    IN_PROGRESS,
    RESOLVED,
    CLOSED
}

