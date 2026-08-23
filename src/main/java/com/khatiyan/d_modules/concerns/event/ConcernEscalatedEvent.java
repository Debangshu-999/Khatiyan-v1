package com.khatiyan.d_modules.concerns.event;

import java.util.UUID;

import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;

/**
 * A waiting concern crossed an escalation threshold.
 *
 * <p>Published only when the level RISES. Escalation is derived from how long a
 * concern has been waiting, so it has no natural moment of its own — the daily
 * sweep in {@code ConcernSchedulerService} is what turns "it has been 48 hours"
 * into something that happened, and this is that something.
 *
 * <p>A level dropping back to NONE — because the concern was picked up or
 * resolved — publishes nothing. That is the concern being dealt with, and the
 * status change already says so.
 */
public record ConcernEscalatedEvent(
    UUID concernId,
    UUID propertyId,
    UUID raisedByUserId,
    ConcernEscalationLevel level,
    String title
) {
}
