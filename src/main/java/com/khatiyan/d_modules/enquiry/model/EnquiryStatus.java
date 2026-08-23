package com.khatiyan.d_modules.enquiry.model;

/**
 * Where an enquiry sits.
 *
 * <p>Only {@code NEW} is enforced anywhere: the partial unique index that keeps
 * one open enquiry per person per property is keyed on it, so an enquirer can
 * ask again once they have been answered but not before.
 */
public enum EnquiryStatus {
    NEW,
    RESPONDED,

    /**
     * Aged out unanswered.
     *
     * <p>Appended, never reordered: the column stores the NAME, and rows written
     * before this existed still read back as NEW or RESPONDED.
     *
     * <p>Moving off NEW is what releases the partial unique index, so an enquirer
     * ignored for a week can ask again instead of being blocked forever.
     */
    EXPIRED
}
