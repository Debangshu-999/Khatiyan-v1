package com.khatiyan.d_modules.lead.model;

/**
 * How the lead's handler got it.
 *
 * <p>The same three names as the enquiry module's assignment, kept as this
 * module's own type: the value is stored here, and a stored value should not
 * change because another module renamed an enum.
 */
public enum LeadHandlerSource {
    FIRST_RESPONSE,
    SYSTEM,
    OWNER
}
