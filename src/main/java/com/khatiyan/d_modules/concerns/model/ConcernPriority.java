package com.khatiyan.d_modules.concerns.model;

/**
 * Urgency level for a concern.
 *
 * <p>Priority is tenant-suggested at creation time and can later help
 * managers decide which concerns need attention first.
 */
public enum ConcernPriority {
    LOW,
    MEDIUM,
    HIGH,
    URGENT
}