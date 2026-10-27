package com.khatiyan.d_modules.enquiry.model;

/**
 * How a record began (user, 2026-10-17). Stored: never rename or remove a value.
 *
 * <p>A direct record carries what an enquiry carries, the contact the person
 * shared, the handler and the chat, but it is never listed as an enquiry: not
 * on the Enquiries screen nor the enquirer's My enquiries.
 */
public enum EnquiryOrigin {

    /** Asked from the property profile's Enquire. */
    ENQUIRY,

    /** A visit booked straight from the property profile, with no enquiry. */
    DIRECT_VISIT,

    /** A stay booked straight from the property profile, with no enquiry and no visit. */
    DIRECT_BOOKING;

    public boolean isDirect() {
        return this != ENQUIRY;
    }
}
