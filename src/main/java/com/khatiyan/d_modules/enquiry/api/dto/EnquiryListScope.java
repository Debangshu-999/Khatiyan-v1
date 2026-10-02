package com.khatiyan.d_modules.enquiry.api.dto;

/** Which enquiries of a property a list shows. */
public enum EnquiryListScope {

    /** Every enquiry on the property. Open to everyone in its management. */
    ALL,

    /** The ones the person asking handles: their "My enquiries". */
    MINE
}
