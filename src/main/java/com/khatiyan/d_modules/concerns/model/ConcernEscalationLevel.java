package com.khatiyan.d_modules.concerns.model;

import java.time.Duration;

/**
 * Operational urgency marker for concerns waiting for real action.
 */
public enum ConcernEscalationLevel {
    NONE,
    ATTENTION,
    ESCALATED,
    CRITICAL;

    public static final Duration ATTENTION_THRESHOLD = Duration.ofHours(24);
    public static final Duration ESCALATED_THRESHOLD = Duration.ofHours(48);
    public static final Duration CRITICAL_THRESHOLD = Duration.ofHours(72);

    public static ConcernEscalationLevel fromWaitingAge(Duration waitingAge) {
        if (waitingAge.compareTo(CRITICAL_THRESHOLD) >= 0) {
            return CRITICAL;
        }

        if (waitingAge.compareTo(ESCALATED_THRESHOLD) >= 0) {
            return ESCALATED;
        }

        if (waitingAge.compareTo(ATTENTION_THRESHOLD) >= 0) {
            return ATTENTION;
        }

        return NONE;
    }
}
