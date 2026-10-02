package com.khatiyan.d_modules.enquiry.model;

/**
 * How a property chooses who handles a new enquiry (owner's decision, 2026-09-30).
 *
 * <p>In every mode the owner can reassign.
 */
public enum EnquiryHandlerMode {

    /** Everyone is told, and whoever tries first owns it. The default. */
    FIRST_RESPONSE,

    /** New enquiries go to the managers in even turns. */
    SYSTEM_TURNS,

    /** The owner assigns each one, and is reminded daily about any still waiting. */
    OWNER_ASSIGNS
}
