package com.khatiyan.d_modules.lead.model;

/**
 * How far a prospect has come.
 *
 * <p>A closed record keeps the stage it reached. Closed is a state, not a
 * stage: see {@link LeadState}.
 */
public enum LeadStage {

    /** They asked. Not yet counted as a lead by the owner. */
    ENQUIRED,

    /** A visit is scheduled. */
    EARLY_LEAD,

    /** They visited and are interested, and have not booked. */
    ADVANCED_LEAD,

    /** A booking is recorded. */
    BOOKED,

    /** The tenancy started. */
    MOVED_IN
}
